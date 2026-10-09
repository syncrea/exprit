import {
  assertArrayLength,
  assertStringLength,
  resolveLimits,
  type ExpressionFunction,
  type IdentifierResolver,
  type Limits,
  type Registry,
} from '@exprit/core';

import * as fn from './legacy-functions';
import { DEFAULT_SAFE_METHODS } from './safe-methods';

/**
 * expr-eval's operator, function and constant tables. The `Parser` facade
 * hands each instance its own mutable copy, so `parser.functions.f = ...`
 * keeps working without touching any shared state.
 */
export interface LegacyTables {
  readonly unaryOps: Record<string, ExpressionFunction>;
  readonly binaryOps: Record<string, ExpressionFunction>;
  readonly ternaryOps: Record<string, ExpressionFunction>;
  readonly functions: Record<string, ExpressionFunction>;
  readonly consts: Record<string, unknown>;
}

/** Creates a fresh copy of expr-eval's default tables. */
export const createLegacyTables = (): LegacyTables => ({
  unaryOps: {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    log: Math.log,
    log2: Math.log2,
    ln: Math.log,
    lg: Math.log10,
    log10: Math.log10,
    expm1: Math.expm1,
    log1p: Math.log1p,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    trunc: Math.trunc,
    '-': fn.neg,
    '+': Number,
    exp: Math.exp,
    not: fn.not,
    length: fn.stringOrArrayLength,
    '!': fn.factorial,
    sign: Math.sign,
  },
  binaryOps: {
    '+': fn.add,
    '-': fn.sub,
    '*': fn.mul,
    '/': fn.div,
    '%': fn.mod,
    '^': fn.pow,
    '||': fn.concat,
    '==': fn.equal,
    '!=': fn.notEqual,
    '>': fn.greaterThan,
    '<': fn.lessThan,
    '>=': fn.greaterThanEqual,
    '<=': fn.lessThanEqual,
    and: fn.andOperator,
    or: fn.orOperator,
    in: fn.inOperator,
    '[': fn.arrayIndex,
  },
  ternaryOps: {
    '?': fn.condition,
  },
  functions: {
    random: fn.random,
    fac: fn.factorial,
    min: fn.min,
    max: fn.max,
    hypot: Math.hypot,
    pyt: Math.hypot,
    pow: Math.pow,
    atan2: Math.atan2,
    if: fn.condition,
    gamma: fn.gamma,
    roundTo: fn.roundTo,
    map: fn.arrayMap,
    fold: fn.arrayFold,
    filter: fn.arrayFilter,
    indexOf: fn.stringOrArrayIndexOf,
    join: fn.arrayJoin,
    sum: fn.sum,
  },
  consts: {
    E: Math.E,
    PI: Math.PI,
    true: true,
    false: false,
  },
});

/**
 * expr-eval's lookup order: registered functions first, then unary operators
 * used as values (`map(sqrt, xs)`), then the caller's own variables.
 */
const createLegacyResolver =
  (
    tables: LegacyTables,
    isOperatorEnabled: (operator: string) => boolean,
  ): IdentifierResolver =>
  (name, scope) => {
    if (Object.hasOwn(tables.functions, name)) {
      return { found: true, value: tables.functions[name] };
    }
    if (Object.hasOwn(tables.unaryOps, name) && isOperatorEnabled(name)) {
      return { found: true, value: tables.unaryOps[name] };
    }
    const value = Object.hasOwn(scope.variables, name)
      ? scope.variables[name]
      : undefined;
    return value === undefined
      ? { found: false, message: `undefined variable: ${name}` }
      : { found: true, value };
  };

/**
 * Builds the registry for the legacy dialect over the given tables. The
 * tables are read live, so functions added after parsing are still found.
 */
/**
 * expr-eval's `||` concatenation, guarded so neither the concatenated string
 * nor the concatenated array can exceed the limits. The check runs before the
 * result is allocated.
 */
const guardedConcat = (
  concat: ExpressionFunction,
  limits: Limits,
): ExpressionFunction =>
  ((a: unknown, b: unknown): unknown => {
    if (Array.isArray(a) && Array.isArray(b)) {
      assertArrayLength(a.length + b.length, limits);
    } else {
      assertStringLength(String(a).length + String(b).length, limits);
    }
    return (concat as (x: unknown, y: unknown) => unknown)(a, b);
  }) as ExpressionFunction;

export const createLegacyRegistry = (
  tables: LegacyTables = createLegacyTables(),
  isOperatorEnabled: (operator: string) => boolean = () => true,
  limits: Limits = resolveLimits(),
): Registry => ({
  unaryOps: tables.unaryOps,
  binaryOps: Object.hasOwn(tables.binaryOps, '||')
    ? {
        ...tables.binaryOps,
        '||': guardedConcat(tables.binaryOps['||'], limits),
      }
    : tables.binaryOps,
  functions: tables.functions,
  consts: tables.consts,
  methods: DEFAULT_SAFE_METHODS,
  resolveIdentifier: createLegacyResolver(tables, isOperatorEnabled),
  limits,
});
