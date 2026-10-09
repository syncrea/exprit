import type { CallNode, ElementNode, ExpressionNode, ObjectNode } from './ast';
import { readMember } from './member-access';
import type { Registry, Variables } from './registry';
import {
  applyLogical,
  assignProperty,
  assignVariable,
  callValue,
  concatTemplate,
  defineNamedFunction,
  isNullish,
  isUnresolvable,
  lookupOperator,
  resolveIdentifier,
  SHORT_CIRCUIT,
  spreadProperties,
  spreadValues,
  withLocals,
  withVariables,
  type Context,
} from './runtime';

const evaluateElements = (
  elements: readonly ElementNode[],
  context: Context,
): unknown[] =>
  elements.flatMap((element) =>
    element.type === 'Spread'
      ? spreadValues(evaluateNode(element.argument, context))
      : [evaluateNode(element, context)],
  );

const evaluateObject = (
  node: ObjectNode,
  context: Context,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const property of node.properties) {
    if (property.type === 'Spread') {
      spreadProperties(result, evaluateNode(property.argument, context));
    } else {
      assignProperty(
        result,
        evaluateNode(property.key, context),
        evaluateNode(property.value, context),
      );
    }
  }
  return result;
};

const evaluateCall = (node: CallNode, context: Context): unknown => {
  const { callee } = node;
  let receiver: unknown;
  let fn: unknown;
  if (callee.type === 'Member' || callee.type === 'Index') {
    receiver = evaluateNode(callee.object, context);
    if (
      receiver === SHORT_CIRCUIT ||
      (callee.optional && isNullish(receiver))
    ) {
      return SHORT_CIRCUIT;
    }
    const key =
      callee.type === 'Member'
        ? callee.property
        : (evaluateNode(callee.index, context) as PropertyKey);
    fn = readMember(receiver, key, context.registry.methods);
  } else {
    fn = evaluateNode(callee, context);
    if (fn === SHORT_CIRCUIT) {
      return SHORT_CIRCUIT;
    }
  }
  if (node.optional && isNullish(fn)) {
    return SHORT_CIRCUIT;
  }
  return callValue(fn, receiver, evaluateElements(node.arguments, context));
};

const evaluateNode = (node: ExpressionNode, context: Context): unknown => {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier':
      return resolveIdentifier(node.name, context);
    case 'Unary': {
      // `typeof missing` must not throw, exactly as in JavaScript.
      if (
        node.operator === 'typeof' &&
        node.argument.type === 'Identifier' &&
        isUnresolvable(node.argument.name, context)
      ) {
        return 'undefined';
      }
      const fn = lookupOperator(
        context.registry.unaryOps,
        node.operator,
        'unary',
      );
      return fn(evaluateNode(node.argument, context));
    }
    case 'Binary': {
      const fn = lookupOperator(
        context.registry.binaryOps,
        node.operator,
        'binary',
      );
      return fn(
        evaluateNode(node.left, context),
        evaluateNode(node.right, context),
      );
    }
    case 'Logical':
      return applyLogical(node.operator, evaluateNode(node.left, context), () =>
        evaluateNode(node.right, context),
      );
    case 'Conditional':
      return evaluateNode(node.test, context)
        ? evaluateNode(node.consequent, context)
        : evaluateNode(node.alternate, context);
    case 'Member':
    case 'Index': {
      const object = evaluateNode(node.object, context);
      if (object === SHORT_CIRCUIT || (node.optional && isNullish(object))) {
        return SHORT_CIRCUIT;
      }
      const key =
        node.type === 'Member'
          ? node.property
          : (evaluateNode(node.index, context) as PropertyKey);
      return readMember(object, key, context.registry.methods);
    }
    case 'Call':
      return evaluateCall(node, context);
    case 'Chain': {
      const value = evaluateNode(node.expression, context);
      return value === SHORT_CIRCUIT ? undefined : value;
    }
    case 'Array':
      return evaluateElements(node.elements, context);
    case 'Object':
      return evaluateObject(node, context);
    case 'Arrow':
      return (...args: unknown[]): unknown =>
        evaluateNode(node.body, withLocals(context, node.params, args));
    case 'Template':
      return concatTemplate(
        node.quasis,
        node.expressions.map((expression) => evaluateNode(expression, context)),
      );
    case 'Assignment':
      return assignVariable(
        context,
        node.name,
        evaluateNode(node.value, context),
      );
    case 'FunctionDefinition':
      return defineNamedFunction(context, node.name, (...args: unknown[]) =>
        evaluateNode(node.body, withVariables(context, node.params, args)),
      );
    case 'Sequence':
      return node.expressions.reduce<unknown>(
        (_, expression) => evaluateNode(expression, context),
        undefined,
      );
  }
};

/**
 * Evaluates an AST against a registry and a set of variables.
 *
 * The evaluator is a plain tree walk: it interprets whitelisted node types and
 * never calls `eval` or the `Function` constructor.
 *
 * @param node - The parsed expression
 * @param registry - Operators, functions and identifier resolution to use
 * @param variables - Variables visible to the expression; legacy assignments write into it
 * @returns The value of the expression
 *
 * @example
 * ```typescript
 * evaluate(parseModern('a + b'), createModernRegistry(), { a: 1, b: 2 }); // 3
 * ```
 */
export const evaluate = (
  node: ExpressionNode,
  registry: Registry,
  variables: Variables = {},
): unknown => evaluateNode(node, { registry, scope: { variables } });
