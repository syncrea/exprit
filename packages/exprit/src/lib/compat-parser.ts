import {
  compile as compileAst,
  evaluate as evaluateAst,
  type ExpressionFunction,
  type ExpressionNode,
  type SymbolOptions,
} from '@exprit/core';
import { createLegacyTables } from '@exprit/registry';

import * as api from './api';
import {
  createRegistry,
  environmentFromTables,
  type Environment,
} from './environment';
import { isOperatorEnabled, type Dialect, type ParserOptions } from './options';

/** A value an expression can work with. Mirrors expr-eval's `Value` type. */
export type Value =
  | number
  | string
  | boolean
  | null
  | undefined
  | readonly Value[]
  | ((...args: never[]) => unknown)
  | { readonly [propertyName: string]: Value };

/**
 * The result of evaluating through the compatibility classes. It is `any`,
 * not `unknown`, because expr-eval's typings return `any`/`number`; code
 * written against expr-eval must keep compiling after switching the import.
 * The functional API returns `unknown`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- drop-in compatibility, see above
export type EvaluationResult = any;

/** Variables for `CompatExpression#evaluate`. Legacy assignments write into this object, as in expr-eval. */
export type Values = Record<string, unknown>;

const normalize = (value: unknown): unknown => (value === 0 ? 0 : value);

/**
 * expr-eval's `Expression`, kept for drop-in compatibility. Each method
 * delegates to the functional API (`evaluate`, `simplify`, `print`, ...).
 * New code should use those functions directly.
 */
export class CompatExpression {
  /** The parsed syntax tree, shared by both dialects. */
  readonly ast: ExpressionNode;
  readonly #parser: CompatParser;

  constructor(ast: ExpressionNode, parser: CompatParser) {
    this.ast = ast;
    this.#parser = parser;
  }

  /** This expression as an immutable value for the functional API, with the parser's current tables. */
  toParsedExpression(): api.ParsedExpression {
    return Object.freeze({ ast: this.ast, env: this.#parser.toEnvironment() });
  }

  /**
   * Evaluates the expression. Unlike the functional `evaluate`, legacy
   * assignments write into `values`, exactly as in expr-eval.
   */
  evaluate(values: Values = {}): EvaluationResult {
    const env = this.#parser.toEnvironment();
    return normalize(evaluateAst(this.ast, createRegistry(env), values));
  }

  /** Compiles the expression into a closure; see the functional `compile`. */
  compile(): (values?: Values) => EvaluationResult {
    const run = compileAst(
      this.ast,
      createRegistry(this.#parser.toEnvironment()),
    );
    return (values: Values = {}) => normalize(run(values));
  }

  simplify(values: Values = {}): CompatExpression {
    return this.#wrap(api.simplify(this.toParsedExpression(), values));
  }

  substitute(
    variable: string,
    expression: CompatExpression | string | number,
  ): CompatExpression {
    const replacement =
      expression instanceof CompatExpression
        ? expression.toParsedExpression()
        : expression;
    return this.#wrap(
      api.substitute(this.toParsedExpression(), variable, replacement),
    );
  }

  symbols(options: SymbolOptions = {}): string[] {
    return [...api.symbols(this.toParsedExpression(), options)];
  }

  variables(options: SymbolOptions = {}): string[] {
    return [...api.variables(this.toParsedExpression(), options)];
  }

  /**
   * Returns a function of the given parameters. Unlike expr-eval, nothing is
   * code-generated; see the functional `toFunction`.
   */
  toJSFunction(
    params: string | readonly string[] = [],
    values: Values = {},
  ): (...args: unknown[]) => EvaluationResult {
    const names =
      typeof params === 'string'
        ? params
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : params;
    return api.toFunction(this.toParsedExpression(), names, values);
  }

  toString(): string {
    return api.print(this.toParsedExpression());
  }

  #wrap(expression: api.ParsedExpression): CompatExpression {
    return new CompatExpression(expression.ast, this.#parser);
  }
}

/**
 * expr-eval's `Parser`, kept for drop-in compatibility. It is a thin layer
 * over the functional API: its mutable tables are snapshotted into a frozen
 * `Environment` on every call.
 *
 * Prefer the functional API (`createEnvironment`, `parse`, `evaluate`) in new code.
 *
 * @example
 * ```typescript
 * const parser = new CompatParser();
 * parser.functions.double = (n: number) => n * 2;
 * parser.evaluate('double(x) + 1', { x: 3 }); // 7
 * ```
 */
export class CompatParser {
  readonly options: ParserOptions;
  readonly dialect: Dialect;
  unaryOps: Record<string, ExpressionFunction>;
  binaryOps: Record<string, ExpressionFunction>;
  ternaryOps: Record<string, ExpressionFunction>;
  functions: Record<string, ExpressionFunction>;
  consts: Record<string, unknown>;

  constructor(options: ParserOptions = {}) {
    const tables = createLegacyTables();
    this.options = options;
    this.dialect = options.dialect ?? 'legacy';
    this.unaryOps = tables.unaryOps;
    this.binaryOps = tables.binaryOps;
    this.ternaryOps = tables.ternaryOps;
    this.functions = tables.functions;
    this.consts = tables.consts;
  }

  /** A frozen snapshot of this parser's current tables and options. */
  toEnvironment(): Environment {
    return environmentFromTables({
      dialect: this.dialect,
      unaryOps: this.unaryOps,
      binaryOps: this.binaryOps,
      ternaryOps: this.ternaryOps,
      functions: this.functions,
      consts: this.consts,
      operators: this.options.operators,
      allowMemberAccess: this.options.allowMemberAccess !== false,
    });
  }

  parse(expression: string): CompatExpression {
    return new CompatExpression(
      api.parse(expression, this.toEnvironment()).ast,
      this,
    );
  }

  evaluate(expression: string, values?: Values): EvaluationResult {
    return this.parse(expression).evaluate(values);
  }

  isOperatorEnabled(operator: string): boolean {
    return isOperatorEnabled(this.options.operators, operator);
  }

  /** Parses with a shared default parser (legacy dialect). */
  static parse(expression: string): CompatExpression {
    return sharedParser().parse(expression);
  }

  /** Parses and evaluates with a shared default parser (legacy dialect). */
  static evaluate(expression: string, values?: Values): EvaluationResult {
    return sharedParser().evaluate(expression, values);
  }
}

let shared: CompatParser | undefined;

function sharedParser(): CompatParser {
  shared ??= new CompatParser();
  return shared;
}
