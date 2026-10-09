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

/**
 * Objects and arrays the evaluator constructed itself: array/object literals,
 * spreads, the containers the sandbox globals build (`Object.fromEntries`,
 * `JSON.parse`, ...) and the new arrays its safe methods return. A function
 * read from one of these is called with `this` undefined, so an expression
 * cannot pick the receiver of a host method by copying it onto a container it
 * controls (F4). Host-provided objects are never in this set, so their methods
 * keep their natural receiver.
 */
const EVALUATOR_OWNED = new WeakSet<object>();

/** Marks a freshly built value as evaluator-owned and returns it. */
export const markOwned = <T extends object>(value: T): T => {
  EVALUATOR_OWNED.add(value);
  return value;
};

/** Marks a value as evaluator-owned only when it is an object or array. */
export const markOwnedIfContainer = (value: unknown): unknown => {
  if (value !== null && typeof value === 'object') {
    EVALUATOR_OWNED.add(value);
  }
  return value;
};

/**
 * The receiver to use when calling a method read from `object`: undefined when
 * the evaluator built `object` itself, the object otherwise.
 */
export const receiverFor = (object: unknown): unknown =>
  typeof object === 'object' && object !== null && EVALUATOR_OWNED.has(object)
    ? undefined
    : object;

/**
 * Safe methods that always return a freshly constructed array (never a host
 * element). Their results are marked evaluator-owned so a function stored in
 * one cannot be called with a chosen receiver.
 */
const NEW_ARRAY_METHODS: ReadonlySet<string> = new Set([
  'concat',
  'filter',
  'flat',
  'flatMap',
  'map',
  'slice',
  'toReversed',
  'toSorted',
  'toSpliced',
  'with',
  'split',
]);

/**
 * Keys JavaScript calls implicitly during type conversion, with the object as
 * `this`. An expression-built object must not carry a function under one of
 * them, or coercing it (`${o}`, `o * 1`, `JSON.stringify(o)`) would call a
 * host function with a receiver the expression chose (F4).
 */
const COERCION_HOOKS: ReadonlySet<string> = new Set([
  'toString',
  'valueOf',
  'toJSON',
  'toLocaleString',
]);

/** Throws if a function is placed under a coercion-hook key of a built object. */
export const assertNoCoercionHook = (name: string, value: unknown): void => {
  if (typeof value === 'function' && COERCION_HOOKS.has(name)) {
    throw new ExpressionSecurityError(
      `a function cannot be stored under "${name}"`,
    );
  }
};

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

/** String conversion that masks functions, applied once per argument. */
const stringifyArg = (value: unknown): string =>
  typeof value === 'function' ? '[Function]' : String(value);

const stringLengthOf = (value: unknown): number =>
  typeof value === 'string' ? value.length : stringifyArg(value).length;

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
          // Convert each argument once and pass the primitive on, so a
          // valueOf/toString hook cannot report one size to the guard and
          // another to the native method.
          const target = toLength(args[0]);
          const fill =
            args[1] === undefined ? undefined : stringifyArg(args[1]);
          assertStringLength(Math.max(length, target), limits);
          return name === 'padStart'
            ? receiver.padStart(target, fill)
            : receiver.padEnd(target, fill);
        };
      case 'concat':
        return (...args) => {
          const parts = args.map(stringifyArg);
          const total = parts.reduce((sum, part) => sum + part.length, length);
          assertStringLength(total, limits);
          return receiver.concat(...parts);
        };
      case 'split':
        return (...args) => {
          const separator =
            args[0] === undefined ? undefined : stringifyArg(args[0]);
          const limit = args[1] === undefined ? undefined : toLength(args[1]);
          // An empty separator yields one element per character; any other
          // separator at most one more element than that.
          const upper = separator === '' ? length : length + 1;
          assertArrayLength(
            limit === undefined ? upper : Math.min(limit, upper),
            limits,
          );
          return receiver.split(separator as string, limit);
        };
      case 'normalize':
      case 'toUpperCase':
      case 'toLowerCase':
      case 'toLocaleUpperCase':
      case 'toLocaleLowerCase':
        // Growth is bounded by a small constant factor (at most 18x for NFKD),
        // so a check on the result keeps it within the limit.
        return (...args) => {
          const result = (receiver[name] as (...a: unknown[]) => string)(
            ...args.map(stringifyArg),
          );
          assertStringLength(result.length, limits);
          return result;
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
          // Drop the thisArg (args[1]) so the callback's receiver cannot be
          // chosen by the expression, matching the array-callback rule.
          const mapped = receiver.map(
            args[0] as (v: unknown, i: number, a: unknown[]) => unknown,
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
          const sep = args[0] === undefined ? ',' : stringifyArg(args[0]);
          let total = sep.length * Math.max(0, length - 1);
          for (const item of receiver) {
            total +=
              item === null || item === undefined ? 0 : stringLengthOf(item);
            assertStringLength(total, limits);
          }
          return receiver.join(sep);
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
  const base =
    guardAmplifyingMethod(receiver, prototype, name, limits) ??
    ((): ((...args: unknown[]) => unknown) => {
      const method = Reflect.get(prototype, name) as (
        ...args: unknown[]
      ) => unknown;
      const dropsThisArg =
        prototype === Array.prototype && THIS_ARG_METHODS.has(name);
      return (...args: unknown[]): unknown =>
        method.apply(receiver, dropsThisArg ? args.slice(0, 1) : args);
    })();
  // A freshly constructed array must be evaluator-owned, so a host function
  // stored in it cannot later be called with a chosen receiver (F4).
  return NEW_ARRAY_METHODS.has(name)
    ? (...args: unknown[]): unknown => {
        const result = base(...args);
        return Array.isArray(result) ? markOwned(result) : result;
      }
    : base;
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
