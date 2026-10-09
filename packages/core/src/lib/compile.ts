import type { ElementNode, ExpressionNode } from './ast';
import { readMember } from './member-access';
import type { Registry, Variables } from './registry';
import {
  appendElement,
  applyLogical,
  assertObjectSize,
  assignProperty,
  assignVariable,
  callValue,
  concatTemplate,
  createBudget,
  defineNamedFunction,
  isNullish,
  isUnresolvable,
  lookupOperator,
  markOwned,
  receiverFor,
  resolveIdentifier,
  SHORT_CIRCUIT,
  spreadProperties,
  tick,
  withLocals,
  withVariables,
  type Context,
} from './runtime';

type Compiled = (context: Context) => unknown;

const compileElements = (
  elements: readonly ElementNode[],
): ((context: Context) => unknown[]) => {
  const parts = elements.map((element) =>
    element.type === 'Spread'
      ? { spread: true, run: compileNode(element.argument) }
      : { spread: false, run: compileNode(element) },
  );
  return (context) => {
    const result: unknown[] = [];
    for (const part of parts) {
      appendElement(result, part.run(context), part.spread, context.registry);
    }
    return markOwned(result);
  };
};

const compileNode = (node: ExpressionNode): Compiled => {
  const run = compileNodeInner(node);
  return (context) => {
    tick(context.budget);
    return run(context);
  };
};

const compileNodeInner = (node: ExpressionNode): Compiled => {
  switch (node.type) {
    case 'Literal': {
      const { value } = node;
      return () => value;
    }
    case 'Identifier': {
      const { name } = node;
      return (context) => resolveIdentifier(name, context);
    }
    case 'Unary': {
      const argument = compileNode(node.argument);
      const { operator } = node;
      const typeofName =
        operator === 'typeof' && node.argument.type === 'Identifier'
          ? node.argument.name
          : undefined;
      return (context) => {
        if (typeofName !== undefined && isUnresolvable(typeofName, context)) {
          return 'undefined';
        }
        return lookupOperator(
          context.registry.unaryOps,
          operator,
          'unary',
        )(argument(context));
      };
    }
    case 'Binary': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      const { operator } = node;
      return (context) =>
        lookupOperator(
          context.registry.binaryOps,
          operator,
          'binary',
        )(left(context), right(context));
    }
    case 'Logical': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      const { operator } = node;
      return (context) =>
        applyLogical(operator, left(context), () => right(context));
    }
    case 'Conditional': {
      const test = compileNode(node.test);
      const consequent = compileNode(node.consequent);
      const alternate = compileNode(node.alternate);
      return (context) =>
        test(context) ? consequent(context) : alternate(context);
    }
    case 'Member':
    case 'Index': {
      const object = compileNode(node.object);
      const key: Compiled =
        node.type === 'Member'
          ? (
              (property) => () =>
                property
            )(node.property)
          : compileNode(node.index);
      const { optional } = node;
      return (context) => {
        const target = object(context);
        if (target === SHORT_CIRCUIT || (optional && isNullish(target))) {
          return SHORT_CIRCUIT;
        }
        return readMember(
          target,
          key(context) as PropertyKey,
          context.registry.methods,
          context.registry.limits,
        );
      };
    }
    case 'Call': {
      const { callee, optional } = node;
      const args = compileElements(node.arguments);
      if (callee.type === 'Member' || callee.type === 'Index') {
        const object = compileNode(callee.object);
        const key: Compiled =
          callee.type === 'Member'
            ? (
                (property) => () =>
                  property
              )(callee.property)
            : compileNode(callee.index);
        return (context) => {
          const receiver = object(context);
          if (
            receiver === SHORT_CIRCUIT ||
            (callee.optional && isNullish(receiver))
          ) {
            return SHORT_CIRCUIT;
          }
          const fn = readMember(
            receiver,
            key(context) as PropertyKey,
            context.registry.methods,
            context.registry.limits,
          );
          return optional && isNullish(fn)
            ? SHORT_CIRCUIT
            : callValue(fn, receiverFor(receiver), args(context));
        };
      }
      const target = compileNode(callee);
      return (context) => {
        const fn = target(context);
        if (fn === SHORT_CIRCUIT || (optional && isNullish(fn))) {
          return SHORT_CIRCUIT;
        }
        return callValue(fn, undefined, args(context));
      };
    }
    case 'Chain': {
      const expression = compileNode(node.expression);
      return (context) => {
        const value = expression(context);
        return value === SHORT_CIRCUIT ? undefined : value;
      };
    }
    case 'Array':
      return compileElements(node.elements);
    case 'Object': {
      const properties = node.properties.map((property) =>
        property.type === 'Spread'
          ? { spread: true as const, value: compileNode(property.argument) }
          : {
              spread: false as const,
              key: compileNode(property.key),
              value: compileNode(property.value),
            },
      );
      return (context) => {
        const result: Record<string, unknown> = {};
        for (const property of properties) {
          if (property.spread) {
            spreadProperties(result, property.value(context));
          } else {
            assignProperty(
              result,
              property.key(context),
              property.value(context),
            );
          }
        }
        return markOwned(assertObjectSize(result, context.registry));
      };
    }
    case 'Arrow': {
      const body = compileNode(node.body);
      const { params } = node;
      return (context) =>
        (...args: unknown[]): unknown =>
          body(withLocals(context, params, args));
    }
    case 'Template': {
      const expressions = node.expressions.map(compileNode);
      const { quasis } = node;
      return (context) =>
        concatTemplate(
          quasis,
          expressions.map((expression) => expression(context)),
          context.registry,
        );
    }
    case 'Assignment': {
      const value = compileNode(node.value);
      const { name } = node;
      return (context) => assignVariable(context, name, value(context));
    }
    case 'FunctionDefinition': {
      const body = compileNode(node.body);
      const { name, params } = node;
      return (context) =>
        defineNamedFunction(context, name, (...args: unknown[]) =>
          body(withVariables(context, params, args)),
        );
    }
    case 'Sequence': {
      const expressions = node.expressions.map(compileNode);
      return (context) =>
        expressions.reduce<unknown>(
          (_, expression) => expression(context),
          undefined,
        );
    }
  }
};

/** A compiled expression: call it with variables to evaluate. */
export type CompiledExpression = (variables?: Variables) => unknown;

/**
 * Turns an AST into a closure for fast repeated evaluation. The tree is walked
 * once, up front; each call then runs the prepared closures. Results are
 * identical to `evaluate`, which stays the simpler default.
 *
 * @example
 * ```typescript
 * const area = compile(parseModern('w * h'), createModernRegistry());
 * area({ w: 2, h: 3 }); // 6
 * ```
 */
export const compile = (
  node: ExpressionNode,
  registry: Registry,
): CompiledExpression => {
  const run = compileNode(node);
  return (variables = {}) =>
    run({ registry, scope: { variables }, budget: createBudget(registry) });
};
