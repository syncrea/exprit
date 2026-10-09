import type {
  ElementNode,
  ExpressionNode,
  PropertyNode,
  SpreadNode,
} from './ast';
import { isBlockedName, readMember } from './member-access';
import type { Registry } from './registry';

type Mapper = (
  node: ExpressionNode,
  bound: ReadonlySet<string>,
) => ExpressionNode;

const withBound = (
  bound: ReadonlySet<string>,
  names: readonly string[],
): ReadonlySet<string> => new Set([...bound, ...names]);

const mapElement = (
  element: ElementNode,
  map: Mapper,
  bound: ReadonlySet<string>,
): ElementNode =>
  element.type === 'Spread'
    ? { ...element, argument: map(element.argument, bound) }
    : map(element, bound);

const mapProperty = (
  property: PropertyNode | SpreadNode,
  map: Mapper,
  bound: ReadonlySet<string>,
): PropertyNode | SpreadNode =>
  property.type === 'Spread'
    ? { ...property, argument: map(property.argument, bound) }
    : {
        ...property,
        key: map(property.key, bound),
        value: map(property.value, bound),
      };

/**
 * Rebuilds `node` with `map` applied to each direct child. `bound` tracks names
 * introduced by enclosing arrow functions, which transforms must not touch.
 */
const mapChildren = (
  node: ExpressionNode,
  map: Mapper,
  bound: ReadonlySet<string>,
): ExpressionNode => {
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return node;
    case 'Unary':
      return { ...node, argument: map(node.argument, bound) };
    case 'Binary':
    case 'Logical':
      return {
        ...node,
        left: map(node.left, bound),
        right: map(node.right, bound),
      };
    case 'Conditional':
      return {
        ...node,
        test: map(node.test, bound),
        consequent: map(node.consequent, bound),
        alternate: map(node.alternate, bound),
      };
    case 'Member':
      return { ...node, object: map(node.object, bound) };
    case 'Index':
      return {
        ...node,
        object: map(node.object, bound),
        index: map(node.index, bound),
      };
    case 'Call':
      return {
        ...node,
        callee: map(node.callee, bound),
        arguments: node.arguments.map((arg) => mapElement(arg, map, bound)),
      };
    case 'Chain':
      return { ...node, expression: map(node.expression, bound) };
    case 'Array':
      return {
        ...node,
        elements: node.elements.map((el) => mapElement(el, map, bound)),
      };
    case 'Object':
      return {
        ...node,
        properties: node.properties.map((p) => mapProperty(p, map, bound)),
      };
    case 'Arrow':
      return { ...node, body: map(node.body, withBound(bound, node.params)) };
    case 'Template':
      return {
        ...node,
        expressions: node.expressions.map((e) => map(e, bound)),
      };
    case 'Assignment':
      return { ...node, value: map(node.value, bound) };
    case 'FunctionDefinition':
      return { ...node, body: map(node.body, bound) };
    case 'Sequence':
      return {
        ...node,
        expressions: node.expressions.map((e) => map(e, bound)),
      };
  }
};

const literal = (value: unknown): ExpressionNode => ({
  type: 'Literal',
  value,
});

const call = (fn: unknown, ...args: unknown[]): unknown =>
  (fn as (...a: unknown[]) => unknown)(...args);

/**
 * Folds constant sub-expressions and inlines the given variable values.
 *
 * Mirrors expr-eval's `simplify()`: unary, binary and member expressions whose
 * operands are all literals are computed; logical operators, conditionals and
 * function calls are left as they are.
 */
export const simplify = (
  node: ExpressionNode,
  registry: Registry,
  values: Readonly<Record<string, unknown>> = {},
): ExpressionNode => {
  const visit: Mapper = (current, bound) => {
    if (current.type === 'Identifier') {
      return !bound.has(current.name) &&
        !isBlockedName(current.name) &&
        Object.hasOwn(values, current.name)
        ? literal(values[current.name])
        : current;
    }
    const next = mapChildren(current, visit, bound);
    switch (next.type) {
      case 'Unary':
        return next.argument.type === 'Literal' &&
          Object.hasOwn(registry.unaryOps, next.operator)
          ? literal(call(registry.unaryOps[next.operator], next.argument.value))
          : next;
      case 'Binary':
        return next.left.type === 'Literal' &&
          next.right.type === 'Literal' &&
          Object.hasOwn(registry.binaryOps, next.operator)
          ? literal(
              call(
                registry.binaryOps[next.operator],
                next.left.value,
                next.right.value,
              ),
            )
          : next;
      case 'Member':
        return next.object.type === 'Literal' && !next.optional
          ? literal(
              readMember(next.object.value, next.property, registry.methods),
            )
          : next;
      default:
        return next;
    }
  };
  return visit(node, new Set());
};

/** Replaces every free occurrence of the variable `name` with `replacement`. */
export const substitute = (
  node: ExpressionNode,
  name: string,
  replacement: ExpressionNode,
): ExpressionNode => {
  const visit: Mapper = (current, bound) =>
    current.type === 'Identifier' && current.name === name && !bound.has(name)
      ? replacement
      : mapChildren(current, visit, bound);
  return visit(node, new Set());
};

/** Options for `symbols` and `variables`. */
export interface SymbolOptions {
  /** Report `a.b.c` member chains as one dotted name instead of just `a`. */
  readonly withMembers?: boolean;
}

/**
 * One step of expr-eval's flat postfix instruction stream: a variable, a
 * member access, a lazily evaluated sub-expression, or anything else.
 */
type Instruction =
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'member'; readonly name: string }
  | { readonly kind: 'expr'; readonly items: readonly Instruction[] }
  | { readonly kind: 'other' };

const OTHER: Instruction = { kind: 'other' };

/** Linearises an AST into the postfix order expr-eval would have produced. */
const linearize = (
  node: ExpressionNode,
  bound: ReadonlySet<string>,
): Instruction[] => {
  const lin = (child: ExpressionNode): Instruction[] => linearize(child, bound);
  const lazy = (
    child: ExpressionNode,
    names: ReadonlySet<string> = bound,
  ): Instruction => ({
    kind: 'expr',
    items: linearize(child, names),
  });
  const elements = (items: readonly ElementNode[]): Instruction[] =>
    items.flatMap((item) =>
      item.type === 'Spread' ? [...lin(item.argument), OTHER] : lin(item),
    );

  switch (node.type) {
    case 'Literal':
      return [OTHER];
    case 'Identifier':
      return bound.has(node.name)
        ? [OTHER]
        : [{ kind: 'var', name: node.name }];
    case 'Unary':
      return [...lin(node.argument), OTHER];
    case 'Binary':
      return [...lin(node.left), ...lin(node.right), OTHER];
    case 'Logical':
      return [...lin(node.left), lazy(node.right), OTHER];
    case 'Conditional':
      return [
        ...lin(node.test),
        lazy(node.consequent),
        lazy(node.alternate),
        OTHER,
      ];
    case 'Member':
      return [...lin(node.object), { kind: 'member', name: node.property }];
    case 'Index':
      return [...lin(node.object), ...lin(node.index), OTHER];
    case 'Call':
      return [...lin(node.callee), ...elements(node.arguments), OTHER];
    case 'Chain':
      return lin(node.expression);
    case 'Array':
      return [...elements(node.elements), OTHER];
    case 'Object':
      return [
        ...node.properties.flatMap((p) =>
          p.type === 'Spread'
            ? [...lin(p.argument), OTHER]
            : [...(p.computed ? lin(p.key) : []), ...lin(p.value)],
        ),
        OTHER,
      ];
    case 'Arrow':
      return [lazy(node.body, withBound(bound, node.params)), OTHER];
    case 'Template':
      return [...node.expressions.flatMap(lin), OTHER];
    case 'Assignment':
      return [{ kind: 'var', name: node.name }, lazy(node.value), OTHER];
    case 'FunctionDefinition':
      return [
        { kind: 'var', name: node.name },
        ...node.params.map((name): Instruction => ({ kind: 'var', name })),
        lazy(node.body),
        OTHER,
      ];
    case 'Sequence':
      return [
        {
          kind: 'expr',
          items: node.expressions.flatMap((e, i) =>
            i === 0 ? lin(e) : [OTHER, ...lin(e)],
          ),
        },
      ];
  }
};

/** expr-eval's `getSymbols`, including the order in which it reports member chains. */
const gatherSymbols = (
  items: readonly Instruction[],
  symbols: string[],
  withMembers: boolean,
): void => {
  const add = (name: string): void => {
    if (!symbols.includes(name)) {
      symbols.push(name);
    }
  };
  let pending: string | undefined;
  for (const item of items) {
    if (item.kind === 'var') {
      if (!withMembers && !symbols.includes(item.name)) {
        symbols.push(item.name);
      } else {
        if (pending !== undefined) {
          add(pending);
        }
        pending = item.name;
      }
    } else if (item.kind === 'member' && withMembers && pending !== undefined) {
      pending = `${pending}.${item.name}`;
    } else if (item.kind === 'expr') {
      gatherSymbols(item.items, symbols, withMembers);
    } else if (pending !== undefined) {
      add(pending);
      pending = undefined;
    }
  }
  if (pending !== undefined) {
    add(pending);
  }
};

/**
 * Lists the free identifiers of an expression without duplicates, in the
 * order expr-eval reports them. Arrow-function parameters are not reported.
 */
export const collectSymbols = (
  node: ExpressionNode,
  options: SymbolOptions = {},
): readonly string[] => {
  const symbols: string[] = [];
  gatherSymbols(
    linearize(node, new Set()),
    symbols,
    Boolean(options.withMembers),
  );
  return symbols;
};
