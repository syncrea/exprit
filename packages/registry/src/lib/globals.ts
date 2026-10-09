import { stringifyValue } from '@exprit/core';

const pick = <T extends object>(
  source: T,
  keys: readonly (keyof T)[],
): Partial<T> =>
  Object.freeze(
    Object.fromEntries(keys.map((key) => [key, source[key]])) as Partial<T>,
  );

/** Attaches static members to a callable, like `Number(x)` next to `Number.isInteger`. */
const namespaces = new Set<object>();

const callableNamespace = <T extends object>(
  call: (value: unknown) => unknown,
  members: T,
): ((value: unknown) => unknown) & T => {
  const namespace = Object.freeze(Object.assign(call, members));
  namespaces.add(namespace);
  return namespace;
};

const mathMembers = Object.getOwnPropertyNames(Math) as (keyof Math)[];

/**
 * The JavaScript globals a modern expression can see. Each is a frozen copy
 * holding only side-effect-free members, never the real built-in object.
 */
export const MODERN_GLOBALS: Readonly<Record<string, unknown>> = Object.freeze({
  Math: pick(Math, mathMembers),
  Number: callableNamespace((value) => Number(value), {
    ...pick(Number, [
      'isFinite',
      'isInteger',
      'isNaN',
      'isSafeInteger',
      'parseFloat',
      'parseInt',
      'EPSILON',
      'MAX_SAFE_INTEGER',
      'MIN_SAFE_INTEGER',
      'MAX_VALUE',
      'MIN_VALUE',
      'NaN',
      'NEGATIVE_INFINITY',
      'POSITIVE_INFINITY',
    ]),
  }),
  String: callableNamespace((value) => stringifyValue(value), {}),
  Boolean: callableNamespace((value) => Boolean(value), {}),
  Array: Object.freeze({ isArray: Array.isArray }),
  Object: pick(Object, ['keys', 'values', 'entries', 'fromEntries']),
  JSON: Object.freeze({
    parse: (text: unknown) => JSON.parse(String(text)) as unknown,
    stringify: (value: unknown, _replacer?: unknown, space?: unknown) =>
      JSON.stringify(value, null, space as number | string | undefined),
  }),
  parseInt: (value: unknown, radix?: unknown) =>
    parseInt(String(value), radix as number),
  parseFloat: (value: unknown) => parseFloat(String(value)),
  isNaN: (value: unknown) => Number.isNaN(Number(value)),
  isFinite: (value: unknown) => Number.isFinite(Number(value)),
  NaN,
  Infinity,
});

/**
 * The callable globals whose members expressions may read (`Number.isInteger`).
 * Members of every other function stay hidden.
 */
export const GLOBAL_NAMESPACES: ReadonlySet<object> = namespaces;
