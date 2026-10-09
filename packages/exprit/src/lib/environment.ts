import type { ExpressionFunction, Registry } from '@exprit/core';
import {
  createLegacyRegistry,
  createLegacyTables,
  createModernRegistry,
} from '@exprit/registry';

import {
  isOperatorEnabled,
  type Dialect,
  type OperatorOptions,
} from './options';

type FunctionTable = Readonly<Record<string, ExpressionFunction>>;
type ValueTable = Readonly<Record<string, unknown>>;

/**
 * Everything that shapes how expressions are parsed and evaluated: the
 * dialect, the operator, function and constant tables, and the operator
 * switches. An environment is frozen; derive a new one with `extend`.
 */
export interface Environment {
  readonly dialect: Dialect;
  /** Legacy dialect only: prefix operators such as `sin x` or `not x`. */
  readonly unaryOps: FunctionTable;
  /** Legacy dialect only: infix operators such as `+` or `and`. */
  readonly binaryOps: FunctionTable;
  /** Legacy dialect only: the conditional operator. */
  readonly ternaryOps: FunctionTable;
  /** Functions callable from both dialects, e.g. `roundTo(x, 2)`. */
  readonly functions: FunctionTable;
  /** Constants visible in both dialects, e.g. `PI`. */
  readonly consts: ValueTable;
  /** Legacy dialect only: operators switched off. */
  readonly operators: Readonly<OperatorOptions>;
  /** Whether `a.b` member access is allowed. */
  readonly allowMemberAccess: boolean;
}

export interface EnvironmentOptions {
  /** `legacy` (expr-eval syntax, the default) or `modern` (JavaScript syntax). */
  readonly dialect?: Dialect;
  /** Functions to add to, or override in, the built-in set. */
  readonly functions?: FunctionTable;
  /** Constants to add to, or override in, the built-in set. */
  readonly consts?: ValueTable;
  /** Legacy dialect only: prefix operators to add or override. */
  readonly unaryOps?: FunctionTable;
  /** Legacy dialect only: infix operator implementations to override. */
  readonly binaryOps?: FunctionTable;
  /** Legacy dialect only: switch individual operators off, e.g. `{ logical: false }`. */
  readonly operators?: OperatorOptions;
  /** Allow `a.b` member access. Defaults to `true`. */
  readonly allowMemberAccess?: boolean;
}

const freezeTable = <T>(
  table: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> => Object.freeze({ ...table });

/**
 * Freezes an environment from complete tables, without merging in defaults.
 * Used by `CompatParser`, whose tables may have had built-ins removed.
 */
export const environmentFromTables = (
  tables: Omit<Environment, 'operators' | 'allowMemberAccess'> &
    Partial<Pick<Environment, 'operators' | 'allowMemberAccess'>>,
): Environment =>
  Object.freeze({
    dialect: tables.dialect,
    unaryOps: freezeTable(tables.unaryOps),
    binaryOps: freezeTable(tables.binaryOps),
    ternaryOps: freezeTable(tables.ternaryOps),
    functions: freezeTable(tables.functions),
    consts: freezeTable(tables.consts),
    operators: Object.freeze({ ...tables.operators }),
    allowMemberAccess: tables.allowMemberAccess ?? true,
  });

/**
 * Derives a new environment. Tables and operator switches are merged over
 * the base; `dialect` and `allowMemberAccess` replace it when given.
 *
 * @example
 * ```typescript
 * const withTau = extend(env, { consts: { TAU: 2 * Math.PI } });
 * ```
 */
export const extend = (
  base: Environment,
  options: EnvironmentOptions,
): Environment =>
  environmentFromTables({
    dialect: options.dialect ?? base.dialect,
    unaryOps: { ...base.unaryOps, ...options.unaryOps },
    binaryOps: { ...base.binaryOps, ...options.binaryOps },
    ternaryOps: base.ternaryOps,
    functions: { ...base.functions, ...options.functions },
    consts: { ...base.consts, ...options.consts },
    operators: { ...base.operators, ...options.operators },
    allowMemberAccess: options.allowMemberAccess ?? base.allowMemberAccess,
  });

/**
 * Creates an environment from expr-eval's built-in operators, functions and
 * constants, plus the given options.
 *
 * @example
 * ```typescript
 * const env = createEnvironment({
 *   dialect: 'modern',
 *   functions: { double: (n: number) => n * 2 },
 * });
 * ```
 */
export const createEnvironment = (
  options: EnvironmentOptions = {},
): Environment =>
  extend(
    environmentFromTables({ dialect: 'legacy', ...createLegacyTables() }),
    options,
  );

/** The default environment: legacy dialect, built-ins only. */
export const DEFAULT_ENVIRONMENT: Environment = createEnvironment();

/** Whether an operator is switched on in the environment. */
export const isEnabled = (
  environment: Environment,
  operator: string,
): boolean => isOperatorEnabled(environment.operators, operator);

/** Builds the evaluator registry for an environment. */
export const createRegistry = (environment: Environment): Registry =>
  environment.dialect === 'modern'
    ? createModernRegistry({
        functions: environment.functions,
        consts: environment.consts,
      })
    : createLegacyRegistry(
        {
          unaryOps: environment.unaryOps,
          binaryOps: environment.binaryOps,
          ternaryOps: environment.ternaryOps,
          functions: environment.functions,
          consts: environment.consts,
        },
        (operator) => isEnabled(environment, operator),
      );
