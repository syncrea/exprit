import {
  collectSymbols,
  compile as compileAst,
  evaluate as evaluateAst,
  simplify as simplifyAst,
  substitute as substituteAst,
  type ExpressionNode,
  type SymbolOptions,
} from '@exprit/core';
import { parseLegacy, printLegacy } from '@exprit/parser-legacy';
import { parseModern, printModern } from '@exprit/parser-modern';
import { MODERN_GLOBALS } from '@exprit/registry';

import {
  createRegistry,
  DEFAULT_ENVIRONMENT,
  isEnabled,
  type Environment,
} from './environment';

/**
 * A parsed expression: its syntax tree and the environment it was parsed in.
 * It is a frozen value; every function that "changes" it returns a new one.
 */
export interface ParsedExpression {
  readonly ast: ExpressionNode;
  readonly env: Environment;
}

/** Variables an expression can read. They are never modified. */
export type Variables = Readonly<Record<string, unknown>>;

export interface EvaluationState {
  readonly value: unknown;
  /** The variables after evaluation, including legacy assignments. A new, frozen object. */
  readonly variables: Variables;
}

/**
 * Deep-freezes the AST nodes. Literal values are left alone: after `simplify`
 * they may be the caller's own arrays or objects, which are not ours to freeze.
 */
const freezeNode = <T>(node: T): T => {
  if (node === null || typeof node !== 'object' || Object.isFrozen(node)) {
    return node;
  }
  const isLiteral = (node as { type?: unknown }).type === 'Literal';
  for (const [key, child] of Object.entries(node)) {
    if (!(isLiteral && key === 'value')) {
      freezeNode(child);
    }
  }
  return Object.freeze(node);
};

const create = (ast: ExpressionNode, env: Environment): ParsedExpression =>
  Object.freeze({ ast: freezeNode(ast), env });

// expr-eval never returns negative zero; the legacy dialect keeps that promise.
const normalize = (env: Environment, value: unknown): unknown =>
  env.dialect === 'legacy' && value === 0 ? 0 : value;

/**
 * Parses an expression.
 *
 * @param source - The expression text
 * @param env - Dialect, functions and options; defaults to the legacy dialect with built-ins
 * @throws ExpressionSyntaxError when the expression is malformed
 *
 * @example
 * ```typescript
 * const expr = parse('2 * x + 1');
 * evaluate(expr, { x: 3 }); // 7
 * ```
 */
export const parse = (
  source: string,
  env: Environment = DEFAULT_ENVIRONMENT,
): ParsedExpression =>
  create(
    env.dialect === 'modern'
      ? parseModern(source)
      : parseLegacy(source, {
          unaryOps: env.unaryOps,
          binaryOps: env.binaryOps,
          ternaryOps: env.ternaryOps,
          consts: env.consts,
          isOperatorEnabled: (operator) => isEnabled(env, operator),
          allowMemberAccess: env.allowMemberAccess,
        }),
    env,
  );

/**
 * Evaluates an expression and returns the variables afterwards. Legacy
 * assignments (`x = 1`) and function definitions (`f(x) = ...`) end up in the
 * returned variables; the input is never modified.
 *
 * @example
 * ```typescript
 * const { value, variables } = evaluateWithState(parse('x = 2; x * 21'), {});
 * // value: 42, variables: { x: 2 }
 * ```
 */
export const evaluateWithState = (
  expression: ParsedExpression,
  variables: Variables = {},
): EvaluationState => {
  const scope = { ...variables };
  const value = normalize(
    expression.env,
    evaluateAst(expression.ast, createRegistry(expression.env), scope),
  );
  return Object.freeze({ value, variables: Object.freeze(scope) });
};

/**
 * Evaluates an expression. The variables are only read, never modified.
 *
 * @example
 * ```typescript
 * evaluate(parse('a + b', createEnvironment({ dialect: 'modern' })), { a: 1, b: 2 }); // 3
 * ```
 */
export const evaluate = (
  expression: ParsedExpression,
  variables: Variables = {},
): unknown => evaluateWithState(expression, variables).value;

/**
 * Compiles an expression into a function for hot paths. The syntax tree is
 * walked once, now; each call evaluates the prepared closures. Results match
 * `evaluate`, and the variables passed in are never modified.
 *
 * @example
 * ```typescript
 * const price = compile(parse('base * (1 + vat)'));
 * price({ base: 200, vat: 0.25 }); // 250
 * ```
 */
export const compile = (
  expression: ParsedExpression,
): ((variables?: Variables) => unknown) => {
  const run = compileAst(expression.ast, createRegistry(expression.env));
  return (variables = {}) => normalize(expression.env, run({ ...variables }));
};

/**
 * Folds constant sub-expressions and inlines the given values.
 *
 * @example
 * ```typescript
 * print(simplify(parse('x * (y + 1)'), { y: 2 })); // '(x * 3)'
 * ```
 */
export const simplify = (
  expression: ParsedExpression,
  values: Variables = {},
): ParsedExpression =>
  create(
    simplifyAst(expression.ast, createRegistry(expression.env), values),
    expression.env,
  );

/**
 * Replaces a variable with another expression. A string or number replacement
 * is parsed in the expression's environment.
 *
 * @example
 * ```typescript
 * print(substitute(parse('x ^ 2'), 'x', 'a + 1')); // '((a + 1) ^ 2)'
 * ```
 */
export const substitute = (
  expression: ParsedExpression,
  variable: string,
  replacement: ParsedExpression | string | number,
): ParsedExpression => {
  const node =
    typeof replacement === 'object'
      ? replacement.ast
      : parse(String(replacement), expression.env).ast;
  return create(substituteAst(expression.ast, variable, node), expression.env);
};

/** Every identifier the expression references, functions included, in expr-eval's order. */
export const symbols = (
  expression: ParsedExpression,
  options: SymbolOptions = {},
): readonly string[] => collectSymbols(expression.ast, options);

const MODERN_GLOBAL_NAMES: ReadonlySet<string> = new Set(
  Object.keys(MODERN_GLOBALS),
);

/**
 * The identifiers the expression expects as variables: its symbols minus
 * functions and, in the modern dialect, constants and globals such as `Math`.
 */
export const variables = (
  expression: ParsedExpression,
  options: SymbolOptions = {},
): readonly string[] => {
  const { dialect, functions, consts } = expression.env;
  return symbols(expression, options).filter((name) => {
    const root = name.split('.')[0];
    if (Object.hasOwn(functions, root)) {
      return false;
    }
    return (
      dialect === 'legacy' ||
      !(Object.hasOwn(consts, root) || MODERN_GLOBAL_NAMES.has(root))
    );
  });
};

/**
 * Prints an expression in its dialect. Legacy output matches expr-eval's
 * `toString()` exactly; modern output is fully parenthesised JavaScript.
 */
export const print = (expression: ParsedExpression): string =>
  expression.env.dialect === 'legacy'
    ? printLegacy(expression.ast)
    : printModern(expression.ast);

/**
 * Turns an expression into a plain function of the given parameters, after
 * inlining `values`. Nothing is code-generated: the function evaluates the
 * simplified syntax tree.
 *
 * @example
 * ```typescript
 * const area = toFunction(parse('w * h'), ['w', 'h']);
 * area(2, 3); // 6
 * ```
 */
export const toFunction = (
  expression: ParsedExpression,
  params: readonly string[],
  values: Variables = {},
): ((...args: readonly unknown[]) => unknown) => {
  const run = compile(simplify(expression, values));
  return (...args) =>
    run(Object.fromEntries(params.map((name, i) => [name, args[i]])));
};
