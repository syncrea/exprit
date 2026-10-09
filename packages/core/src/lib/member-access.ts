import { ExpressionSecurityError } from './errors';
import {
  assertArrayLength,
  assertStringLength,
  DEFAULT_LIMITS,
  type Limits,
} from './limits';
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

const toLength = (value: unknown): number => {
  const n = Math.trunc(Number(value));
  return Number.isNaN(n) ? 0 : n;
};

const stringLengthOf = (value: unknown): number =>
  typeof value === 'string' ? value.length : String(value).length;

/**
 * Checks, before the native method allocates, that a size-amplifying string or
 * array method cannot produce something larger than the configured limits.
 * Returns `undefined` for methods that cannot amplify (the caller binds those
 * directly). The predictions are conservative upper bounds.
 */
const guardAmplifyingMethod = (
  receiver: unknown,
  prototype: object,
  name: string,
  limits: Limits,
): ((...args: unknown[]) => unknown) | undefined => {
  if (prototype === String.prototype && typeof receiver === 'string') {
    const length = receiver.length;
    switch (name) {
      case 'repeat':
        return (...args) => {
          const count = toLength(args[0]);
          if (count >= 0) {
            assertStringLength(length * count, limits);
          }
          return receiver.repeat(count);
        };
      case 'padStart':
      case 'padEnd':
        return (...args) => {
          assertStringLength(Math.max(length, toLength(args[0])), limits);
          return (receiver[name] as (...a: unknown[]) => string)(...args);
        };
      case 'concat':
        return (...args) => {
          const total = args.reduce<number>(
            (sum, arg) => sum + stringLengthOf(arg),
            length,
          );
          assertStringLength(total, limits);
          return receiver.concat(...(args as string[]));
        };
      case 'split':
        return (...args) => {
          const requested =
            args[1] === undefined ? length + 1 : toLength(args[1]);
          assertArrayLength(Math.min(requested, length + 1), limits);
          return receiver.split(args[0] as string, args[1] as number);
        };
      case 'replace':
      case 'replaceAll':
        return (...args) => {
          const replacement = args[1];
          if (typeof replacement === 'string') {
            assertStringLength(length * (1 + replacement.length), limits);
          }
          const result = (receiver[name] as (...a: unknown[]) => string)(
            ...args,
          );
          assertStringLength(result.length, limits);
          return result;
        };
    }
  }
  if (prototype === Array.prototype && Array.isArray(receiver)) {
    const length = receiver.length;
    switch (name) {
      case 'concat':
        return (...args) => {
          const total = args.reduce<number>(
            (sum, arg) => sum + (Array.isArray(arg) ? arg.length : 1),
            length,
          );
          assertArrayLength(total, limits);
          return receiver.concat(...args);
        };
      case 'flat':
        return (...args) =>
          safeFlat(
            receiver,
            args[0] === undefined ? 1 : toLength(args[0]),
            limits,
          );
      case 'flatMap':
        return (...args) => {
          const mapped = receiver.map(
            args[0] as (v: unknown, i: number, a: unknown[]) => unknown,
            args[1],
          );
          return safeFlat(mapped, 1, limits);
        };
      case 'toSpliced':
        return (...args) => {
          const items = Math.max(0, args.length - 2);
          assertArrayLength(length + items, limits);
          return (
            receiver as unknown as {
              toSpliced: (...a: unknown[]) => unknown[];
            }
          ).toSpliced(...args);
        };
      case 'join':
        return (...args) => {
          const sep = args[0] === undefined ? ',' : String(args[0]);
          let total = sep.length * Math.max(0, length - 1);
          for (const item of receiver) {
            total +=
              item === null || item === undefined ? 0 : stringLengthOf(item);
            assertStringLength(total, limits);
          }
          return receiver.join(args[0] as string);
        };
    }
  }
  return undefined;
};

/** Flattens an array to a depth, counting elements so the result stays bounded. */
const safeFlat = (
  array: readonly unknown[],
  depth: number,
  limits: Limits,
): unknown[] => {
  const result: unknown[] = [];
  const walk = (items: readonly unknown[], remaining: number): void => {
    for (const item of items) {
      if (remaining > 0 && Array.isArray(item)) {
        walk(item, remaining - 1);
      } else {
        result.push(item);
        assertArrayLength(result.length, limits);
      }
    }
  };
  walk(array, depth);
  return result;
};

const bindMethod = (
  receiver: unknown,
  prototype: object,
  name: string,
  limits: Limits,
): ((...args: unknown[]) => unknown) => {
  const guarded = guardAmplifyingMethod(receiver, prototype, name, limits);
  if (guarded !== undefined) {
    return guarded;
  }
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
  limits: Limits = DEFAULT_LIMITS,
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
      ? bindMethod(object, String.prototype, name, limits)
      : undefined;
  }

  if (typeof object === 'number') {
    return isAllowedMethod(methods.number, name)
      ? bindMethod(object, Number.prototype, name, limits)
      : undefined;
  }

  if (Array.isArray(object)) {
    if (name === 'length' || Object.hasOwn(object, name)) {
      return (object as unknown as Record<string, unknown>)[name];
    }
    return isAllowedMethod(methods.array, name)
      ? bindMethod(object, Array.prototype, name, limits)
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
