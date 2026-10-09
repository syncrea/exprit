import {
  assertStringLength,
  resolveLimits,
  stringifyValue,
  type ExpressionFunction,
  type IdentifierResolver,
  type Limits,
  type Registry,
} from '@exprit/core';

import { MODERN_GLOBALS } from './globals';
import { DEFAULT_SAFE_METHODS } from './safe-methods';

type Num = number;
const n = (value: unknown): Num => value as Num;

/** JavaScript's binary operators with their native semantics. */
export const MODERN_BINARY_OPS: Readonly<Record<string, ExpressionFunction>> = {
  '+': (a: unknown, b: unknown) => n(a) + n(b),
  '-': (a: unknown, b: unknown) => n(a) - n(b),
  '*': (a: unknown, b: unknown) => n(a) * n(b),
  '/': (a: unknown, b: unknown) => n(a) / n(b),
  '%': (a: unknown, b: unknown) => n(a) % n(b),
  '**': (a: unknown, b: unknown) => n(a) ** n(b),
  '===': (a: unknown, b: unknown) => a === b,
  '!==': (a: unknown, b: unknown) => a !== b,
  '<': (a: unknown, b: unknown) => n(a) < n(b),
  '>': (a: unknown, b: unknown) => n(a) > n(b),
  '<=': (a: unknown, b: unknown) => n(a) <= n(b),
  '>=': (a: unknown, b: unknown) => n(a) >= n(b),
  '&': (a: unknown, b: unknown) => n(a) & n(b),
  '|': (a: unknown, b: unknown) => n(a) | n(b),
  '^': (a: unknown, b: unknown) => n(a) ^ n(b),
  '<<': (a: unknown, b: unknown) => n(a) << n(b),
  '>>': (a: unknown, b: unknown) => n(a) >> n(b),
  '>>>': (a: unknown, b: unknown) => n(a) >>> n(b),
};

/** JavaScript's prefix operators, minus `delete`, `void` and `await`. */
export const MODERN_UNARY_OPS: Readonly<Record<string, ExpressionFunction>> = {
  '-': (a: unknown) => -n(a),
  '+': (a: unknown) => +n(a),
  '!': (a: unknown) => !a,
  '~': (a: unknown) => ~n(a),
  typeof: (a: unknown) => typeof a,
};

export interface ModernTables {
  readonly functions: Readonly<Record<string, ExpressionFunction>>;
  readonly consts: Readonly<Record<string, unknown>>;
  readonly globals: Readonly<Record<string, unknown>>;
}

/**
 * JavaScript-like lookup: arrow parameters, then the caller's variables, then
 * registered constants and functions, then the safe globals.
 */
const createModernResolver =
  (tables: ModernTables): IdentifierResolver =>
  (name, scope) => {
    if (scope.locals && Object.hasOwn(scope.locals, name)) {
      return { found: true, value: scope.locals[name] };
    }
    for (const table of [
      scope.variables,
      tables.consts,
      tables.functions,
      tables.globals,
    ]) {
      if (Object.hasOwn(table, name)) {
        return { found: true, value: table[name] };
      }
    }
    return { found: false, message: `${name} is not defined` };
  };

/**
 * JavaScript `+` guarded so string concatenation cannot build a string past
 * the limit; numeric addition is untouched. The check runs before the new
 * string is allocated.
 */
const guardedPlus = (limits: Limits): ExpressionFunction =>
  ((a: unknown, b: unknown): unknown => {
    if (typeof a === 'string' || typeof b === 'string') {
      // String concatenation: mask functions (F5) and bound the length (F1).
      const left = stringifyValue(a);
      const right = stringifyValue(b);
      assertStringLength(left.length + right.length, limits);
      return left + right;
    }
    return (a as number) + (b as number);
  }) as ExpressionFunction;

/** Builds the registry for the modern, JavaScript-flavoured dialect. */
export const createModernRegistry = (
  tables: Partial<ModernTables> = {},
  limits: Limits = resolveLimits(),
): Registry => {
  const resolved: ModernTables = {
    functions: tables.functions ?? {},
    consts: tables.consts ?? {},
    globals: tables.globals ?? MODERN_GLOBALS,
  };
  return {
    unaryOps: MODERN_UNARY_OPS,
    binaryOps: { ...MODERN_BINARY_OPS, '+': guardedPlus(limits) },
    functions: resolved.functions,
    consts: resolved.consts,
    methods: DEFAULT_SAFE_METHODS,
    resolveIdentifier: createModernResolver(resolved),
    limits,
  };
};
