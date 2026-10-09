import { ExpressionSecurityError } from './errors';
import type { SafeMethods } from './registry';

/**
 * Names that would let an expression reach an object's prototype or a function
 * constructor. They are rejected everywhere: identifiers, members and object keys.
 */
const BLOCKED_NAMES: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  // Sloppy-mode functions expose their call stack through these.
  'caller',
  'callee',
  'arguments',
]);

export const isBlockedName = (name: string): boolean => BLOCKED_NAMES.has(name);

export const assertAllowedName = (name: string): void => {
  if (isBlockedName(name)) {
    throw new ExpressionSecurityError(`access to "${name}" is not allowed`);
  }
};

const isArrayIndex = (key: string): boolean => /^(?:0|[1-9]\d*)$/.test(key);

const describe = (value: unknown): string =>
  value === null ? 'null' : typeof value;

/**
 * Array methods whose second argument is `thisArg`. It is dropped, so an
 * expression can never choose the receiver of a host function it passes in.
 */
const THIS_ARG_METHODS: ReadonlySet<string> = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'map',
  'some',
]);

const bindMethod = (
  receiver: unknown,
  prototype: object,
  name: string,
): ((...args: unknown[]) => unknown) => {
  const method = Reflect.get(prototype, name) as (
    ...args: unknown[]
  ) => unknown;
  const dropsThisArg =
    prototype === Array.prototype && THIS_ARG_METHODS.has(name);
  return (...args: unknown[]): unknown =>
    method.apply(receiver, dropsThisArg ? args.slice(0, 1) : args);
};

const isAllowedMethod = (methods: readonly string[], key: string): boolean =>
  methods.includes(key);

/**
 * Reads `object[key]` without ever exposing inherited properties other than the
 * whitelisted methods in `methods`. Own data of user-supplied objects and
 * arrays is readable; members of functions and anything reached through a
 * prototype chain are not.
 *
 * @throws ExpressionSecurityError for blocked names such as `__proto__`
 * @throws TypeError when reading from `null` or `undefined`
 */
export const readMember = (
  object: unknown,
  key: PropertyKey,
  methods: SafeMethods,
): unknown => {
  if (typeof key === 'symbol') {
    throw new ExpressionSecurityError('symbol property access is not allowed');
  }
  const name = String(key);
  assertAllowedName(name);

  if (object === null || object === undefined) {
    throw new TypeError(
      `Cannot read properties of ${describe(object)} (reading '${name}')`,
    );
  }

  if (typeof object === 'string') {
    if (name === 'length' || isArrayIndex(name)) {
      return object[name as 'length'];
    }
    return isAllowedMethod(methods.string, name)
      ? bindMethod(object, String.prototype, name)
      : undefined;
  }

  if (typeof object === 'number') {
    return isAllowedMethod(methods.number, name)
      ? bindMethod(object, Number.prototype, name)
      : undefined;
  }

  if (Array.isArray(object)) {
    if (name === 'length' || Object.hasOwn(object, name)) {
      return (object as unknown as Record<string, unknown>)[name];
    }
    return isAllowedMethod(methods.array, name)
      ? bindMethod(object, Array.prototype, name)
      : undefined;
  }

  // Functions are opaque, except the namespaces the registry built itself,
  // such as `Number` with `Number.isInteger`.
  if (typeof object === 'function') {
    return methods.namespaces.has(object) && Object.hasOwn(object, name)
      ? (object as unknown as Record<string, unknown>)[name]
      : undefined;
  }

  if (typeof object === 'object' && Object.hasOwn(object, name)) {
    return (object as Record<string, unknown>)[name];
  }

  return undefined;
};
