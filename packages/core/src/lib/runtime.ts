import type { LogicalOperator } from './ast';
import {
  assertArrayLength,
  assertObjectKeys,
  assertStringLength,
  ExpressionLimitError,
} from './limits';
import { assertAllowedName } from './member-access';
import type { Registry, Scope } from './registry';

/**
 * Runtime semantics shared by the tree-walking evaluator and the closure
 * compiler, so both always agree on what an operation means.
 */

export type Callable = (...args: unknown[]) => unknown;

/** A mutable step budget, shared across the scopes of one evaluation. */
export interface Budget {
  steps: number;
}

export interface Context {
  readonly registry: Registry;
  readonly scope: Scope;
  /** Present when a finite `maxSteps` limit is in force. */
  readonly budget?: Budget;
}

/** Creates the shared step budget for one top-level evaluation, if finite. */
export const createBudget = (registry: Registry): Budget | undefined =>
  Number.isFinite(registry.limits.maxSteps)
    ? { steps: registry.limits.maxSteps }
    : undefined;

/** Charges one evaluation step; throws once the budget is spent. */
export const tick = (budget: Budget | undefined): void => {
  if (budget !== undefined && --budget.steps < 0) {
    throw new ExpressionLimitError(
      'maxSteps',
      'evaluation exceeded the maximum number of steps',
    );
  }
};

/** Marks a short-circuited optional chain while it unwinds to its `Chain` node. */
export const SHORT_CIRCUIT: unique symbol = Symbol('short-circuit');

export const isCallable = (value: unknown): value is Callable =>
  typeof value === 'function';

export const isNullish = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

export const lookupOperator = (
  table: Readonly<Record<string, unknown>>,
  operator: string,
  kind: 'unary' | 'binary',
): Callable => {
  const fn = Object.hasOwn(table, operator) ? table[operator] : undefined;
  if (!isCallable(fn)) {
    throw new Error(`unknown ${kind} operator: ${operator}`);
  }
  return fn;
};

export const resolveIdentifier = (name: string, context: Context): unknown => {
  assertAllowedName(name);
  const resolution = context.registry.resolveIdentifier(name, context.scope);
  if (!resolution.found) {
    throw new Error(resolution.message);
  }
  return resolution.value;
};

export const isUnresolvable = (name: string, context: Context): boolean =>
  !context.registry.resolveIdentifier(name, context.scope).found;

/** Applies a short-circuiting operator; `right` is only evaluated when needed. */
export const applyLogical = (
  operator: LogicalOperator,
  left: unknown,
  right: () => unknown,
): unknown => {
  switch (operator) {
    case 'and':
      return left ? Boolean(right()) : false;
    case 'or':
      return left ? true : Boolean(right());
    case '&&':
      return left ? right() : left;
    case '||':
      return left ? left : right();
    case '??':
      return left ?? right();
  }
};

export const spreadValues = (value: unknown): unknown[] => {
  if (typeof value === 'string' || Array.isArray(value)) {
    return [...value];
  }
  throw new TypeError(`${typeof value} is not iterable`);
};

/**
 * Appends an element or a spread to an array under construction, checking the
 * array-length limit as it grows so a chain of spreads cannot allocate a huge
 * array before the limit is noticed.
 */
export const appendElement = (
  acc: unknown[],
  value: unknown,
  spread: boolean,
  registry: Registry,
): void => {
  if (spread) {
    for (const item of spreadValues(value)) {
      acc.push(item);
      assertArrayLength(acc.length, registry.limits);
    }
  } else {
    acc.push(value);
    assertArrayLength(acc.length, registry.limits);
  }
};

/** Checks that a freshly built object literal stays within the key limit. */
export const assertObjectSize = (
  object: Record<string, unknown>,
  registry: Registry,
): Record<string, unknown> => {
  assertObjectKeys(Object.keys(object).length, registry.limits);
  return object;
};

export const assignProperty = (
  target: Record<string, unknown>,
  key: unknown,
  value: unknown,
): void => {
  const name = String(key);
  assertAllowedName(name);
  target[name] = value;
};

/**
 * Copies own enumerable keys one by one. `Object.assign` would invoke the
 * `__proto__` setter for an own `__proto__` key (as `JSON.parse` creates).
 */
export const spreadProperties = (
  target: Record<string, unknown>,
  value: unknown,
): void => {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      assignProperty(target, key, (value as Record<string, unknown>)[key]);
    }
  }
};

export const callValue = (
  callee: unknown,
  receiver: unknown,
  args: unknown[],
): unknown => {
  if (!isCallable(callee)) {
    throw new TypeError(`${String(callee)} is not a function`);
  }
  return callee.apply(receiver, args);
};

export const withLocals = (
  context: Context,
  params: readonly string[],
  args: readonly unknown[],
): Context => {
  const locals: Record<string, unknown> = { ...context.scope.locals };
  params.forEach((param, i) => {
    assertAllowedName(param);
    locals[param] = args[i];
  });
  return { ...context, scope: { ...context.scope, locals } };
};

/** Legacy function definitions see a snapshot of the variables plus their parameters. */
export const withVariables = (
  context: Context,
  params: readonly string[],
  args: readonly unknown[],
): Context => {
  const variables: Record<string, unknown> = { ...context.scope.variables };
  params.forEach((param, i) => {
    assertAllowedName(param);
    variables[param] = args[i];
  });
  return { ...context, scope: { ...context.scope, variables } };
};

export const defineNamedFunction = (
  context: Context,
  name: string,
  fn: Callable,
): Callable => {
  assertAllowedName(name);
  Object.defineProperty(fn, 'name', { value: name, writable: false });
  context.scope.variables[name] = fn;
  return fn;
};

export const assignVariable = (
  context: Context,
  name: string,
  value: unknown,
): unknown => {
  assertAllowedName(name);
  context.scope.variables[name] = value;
  return value;
};

/**
 * Coerces a value to a string the way templates and `String()` do, but renders
 * functions as an opaque `[Function]` token instead of their full source, so a
 * host function passed in as a variable does not leak its body (F5).
 */
export const stringifyValue = (value: unknown): string =>
  typeof value === 'function' ? '[Function]' : String(value);

export const concatTemplate = (
  quasis: readonly string[],
  values: readonly unknown[],
  registry: Registry,
): string =>
  quasis.reduce((text, quasi, i) => {
    const next =
      i < values.length
        ? `${text}${quasi}${stringifyValue(values[i])}`
        : `${text}${quasi}`;
    assertStringLength(next.length, registry.limits);
    return next;
  }, '');
