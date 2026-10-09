/**
 * `@syncrea/exprit`: a TypeScript-first, functional-first expression parser
 * and evaluator. A drop-in replacement for expr-eval, plus a second dialect
 * that reads like JavaScript.
 *
 * Build a frozen `Environment` with `createEnvironment`, `parse` a string
 * into a frozen `ParsedExpression`, then `evaluate` it with your variables.
 * The expr-eval classes (`CompatParser`, `CompatExpression` and the
 * deprecated `Parser`/`Expression` aliases) are a thin layer over the same
 * functions.
 *
 * @packageDocumentation
 */
import { CompatExpression, CompatParser } from './lib/compat-parser';

/*
 * The functional API: frozen environments and expressions, pure functions.
 * This is the recommended way to use exprit.
 */
export {
  compile,
  evaluate,
  evaluateWithState,
  parse,
  print,
  simplify,
  substitute,
  symbols,
  toFunction,
  variables,
  type EvaluationState,
  type ParsedExpression,
  type Variables,
} from './lib/api';
export {
  createEnvironment,
  DEFAULT_ENVIRONMENT,
  extend,
  type Environment,
  type EnvironmentOptions,
} from './lib/environment';
export type { Dialect, OperatorOptions, ParserOptions } from './lib/options';
export {
  ExpressionSecurityError,
  ExpressionSyntaxError,
  type ExpressionNode,
  type SymbolOptions,
} from '@exprit/core';

/*
 * expr-eval compatibility: the class-based API, a thin layer over the
 * functional one.
 */
export {
  CompatExpression,
  CompatParser,
  type EvaluationResult,
  type Value,
  type Values,
} from './lib/compat-parser';

/**
 * expr-eval's name for `CompatParser`, so `import { Parser } from 'expr-eval'`
 * keeps working after changing only the package name.
 *
 * @deprecated Use the functional API (`createEnvironment`, `parse`,
 * `evaluate`), or `CompatParser` while migrating.
 *
 * @group expr-eval compatibility
 */
export const Parser = CompatParser;
/**
 * @deprecated expr-eval compatibility alias; see `Parser`.
 *
 * @group expr-eval compatibility
 */
export type Parser = CompatParser;

/**
 * expr-eval's name for `CompatExpression`.
 *
 * @deprecated Use `ParsedExpression` with the functional API.
 *
 * @group expr-eval compatibility
 */
export const Expression = CompatExpression;
/**
 * @deprecated expr-eval compatibility alias; see `Expression`.
 *
 * @group expr-eval compatibility
 */
export type Expression = CompatExpression;

/**
 * expr-eval also exposes `{ Parser, Expression }` as its default export, so
 * `import exprEval from 'expr-eval'` keeps working after switching packages.
 *
 * @group expr-eval compatibility
 */
// eslint-disable-next-line no-restricted-syntax -- required for drop-in compatibility
export default { Parser: CompatParser, Expression: CompatExpression };
