import type { LogicalOperator } from './ast';
import { assertAllowedName } from './member-access';
import type { Registry, Scope } from './registry';

/**
 * Runtime semantics shared by the tree-walking evaluator and the closure
 * compiler, so both always agree on what an operation means.
 */

export type Callable = (...args: unknown[]) => unknown;

export interface Context {
  readonly registry: Registry;
  readonly scope: Scope;
}

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

export const concatTemplate = (
  quasis: readonly string[],
  values: readonly unknown[],
): string =>
  quasis.reduce(
    (text, quasi, i) =>
      i < values.length
        ? `${text}${quasi}${String(values[i])}`
        : `${text}${quasi}`,
    '',
  );
