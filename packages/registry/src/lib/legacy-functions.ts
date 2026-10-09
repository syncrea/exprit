/**
 * expr-eval's operator and function implementations, ported as-is so legacy
 * expressions produce identical results. Inputs are deliberately loosely typed:
 * expressions pass whatever values the caller supplied.
 */

import { stringifyValue } from '@exprit/core';

const toNumber = (value: unknown): number => Number(value);
const asNumber = (value: unknown): number => value as number;

export const add = (a: unknown, b: unknown): number =>
  toNumber(a) + toNumber(b);
export const sub = (a: unknown, b: unknown): number =>
  asNumber(a) - asNumber(b);
export const mul = (a: unknown, b: unknown): number =>
  asNumber(a) * asNumber(b);
export const div = (a: unknown, b: unknown): number =>
  asNumber(a) / asNumber(b);
export const mod = (a: unknown, b: unknown): number =>
  asNumber(a) % asNumber(b);
export const pow = (a: unknown, b: unknown): number =>
  Math.pow(asNumber(a), asNumber(b));

export const concat = (a: unknown, b: unknown): unknown =>
  Array.isArray(a) && Array.isArray(b)
    ? [...a, ...b]
    : `${stringifyValue(a)}${stringifyValue(b)}`;

export const equal = (a: unknown, b: unknown): boolean => a === b;
export const notEqual = (a: unknown, b: unknown): boolean => a !== b;
export const greaterThan = (a: unknown, b: unknown): boolean =>
  asNumber(a) > asNumber(b);
export const lessThan = (a: unknown, b: unknown): boolean =>
  asNumber(a) < asNumber(b);
export const greaterThanEqual = (a: unknown, b: unknown): boolean =>
  asNumber(a) >= asNumber(b);
export const lessThanEqual = (a: unknown, b: unknown): boolean =>
  asNumber(a) <= asNumber(b);
export const andOperator = (a: unknown, b: unknown): boolean => Boolean(a && b);
export const orOperator = (a: unknown, b: unknown): boolean => Boolean(a || b);

export const inOperator = (a: unknown, b: unknown): boolean =>
  Array.prototype.some.call(
    b as ArrayLike<unknown>,
    (item: unknown) => item === a,
  );

export const neg = (a: unknown): number => -asNumber(a);
export const not = (a: unknown): boolean => !a;

export const random = (a?: unknown): number =>
  Math.random() * (asNumber(a) || 1);

const isInteger = (value: number): boolean =>
  Number.isFinite(value) && value === Math.round(value);

const GAMMA_G = 4.7421875;
// Coefficients copied digit for digit from expr-eval; the runtime values are identical.
/* eslint-disable no-loss-of-precision */
const GAMMA_P = [
  0.99999999999999709182, 57.156235665862923517, -59.597960355475491248,
  14.136097974741747174, -0.49191381609762019978, 0.33994649984811888699e-4,
  0.46523628927048575665e-4, -0.98374475304879564677e-4,
  0.15808870322491248884e-3, -0.21026444172410488319e-3,
  0.2174396181152126432e-3, -0.16431810653676389022e-3,
  0.84418223983852743293e-4, -0.2619083840158140867e-4,
  0.36899182659531622704e-5,
];
/* eslint-enable no-loss-of-precision */

/** Gamma function, from math.js via expr-eval. */
export const gamma = (input: unknown): number => {
  let n = asNumber(input);
  if (isInteger(n)) {
    if (n <= 0) {
      return Number.isFinite(n) ? Infinity : NaN;
    }
    if (n > 171) {
      return Infinity;
    }
    let value = n - 2;
    let res = n - 1;
    while (value > 1) {
      res *= value;
      value--;
    }
    // 0! is 1 by definition.
    return res === 0 ? 1 : res;
  }

  if (n < 0.5) {
    return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n));
  }
  if (n >= 171.35) {
    return Infinity;
  }
  if (n > 85.0) {
    // Extended Stirling approximation.
    const twoN = n * n;
    const threeN = twoN * n;
    const fourN = threeN * n;
    const fiveN = fourN * n;
    return (
      Math.sqrt((2 * Math.PI) / n) *
      Math.pow(n / Math.E, n) *
      (1 +
        1 / (12 * n) +
        1 / (288 * twoN) -
        139 / (51840 * threeN) -
        571 / (2488320 * fourN) +
        163879 / (209018880 * fiveN) +
        5246819 / (75246796800 * fiveN * n))
    );
  }

  --n;
  let x = GAMMA_P[0];
  for (let i = 1; i < GAMMA_P.length; ++i) {
    x += GAMMA_P[i] / (n + i);
  }
  const t = n + GAMMA_G + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
};

export const factorial = (a: unknown): number => gamma(asNumber(a) + 1);

export const stringOrArrayLength = (s: unknown): number =>
  Array.isArray(s) ? s.length : String(s).length;

export const condition = (cond: unknown, yes: unknown, no: unknown): unknown =>
  cond ? yes : no;

/** Decimal rounding to `exp` places, from @escopecz via expr-eval. */
export const roundTo = (input: unknown, exponent?: unknown): number => {
  if (exponent === undefined || +asNumber(exponent) === 0) {
    return Math.round(asNumber(input));
  }
  const value = +asNumber(input);
  const exp = -+asNumber(exponent);
  if (Number.isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  const [mantissa, power] = value.toString().split('e');
  const shifted = Math.round(+`${mantissa}e${power ? +power - exp : -exp}`);
  const [shiftedMantissa, shiftedPower] = shifted.toString().split('e');
  return +`${shiftedMantissa}e${shiftedPower ? +shiftedPower + exp : exp}`;
};

export const arrayIndex = (array: unknown, index: unknown): unknown =>
  (array as Record<number, unknown>)[asNumber(index) | 0];

export const max = (...args: unknown[]): number => {
  const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return Math.max(...(values as number[]));
};

export const min = (...args: unknown[]): number => {
  const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return Math.min(...(values as number[]));
};

type Callback = (...args: unknown[]) => unknown;

const assertFunction: (fn: unknown, name: string) => asserts fn is Callback = (
  fn,
  name,
) => {
  if (typeof fn !== 'function') {
    throw new Error(`First argument to ${name} is not a function`);
  }
};

const assertArray: (
  value: unknown,
  name: string,
) => asserts value is unknown[] = (value, name) => {
  if (!Array.isArray(value)) {
    throw new Error(`Second argument to ${name} is not an array`);
  }
};

export const arrayMap = (f: unknown, a: unknown): unknown[] => {
  assertFunction(f, 'map');
  assertArray(a, 'map');
  return a.map((x, i) => f(x, i));
};

export const arrayFold = (f: unknown, init: unknown, a: unknown): unknown => {
  assertFunction(f, 'fold');
  assertArray(a, 'fold');
  return a.reduce((acc, x, i) => f(acc, x, i), init);
};

export const arrayFilter = (f: unknown, a: unknown): unknown[] => {
  assertFunction(f, 'filter');
  assertArray(a, 'filter');
  return a.filter((x, i) => f(x, i));
};

export const stringOrArrayIndexOf = (target: unknown, s: unknown): number => {
  if (typeof s === 'string') {
    return s.indexOf(target as string);
  }
  if (Array.isArray(s)) {
    return s.indexOf(target);
  }
  throw new Error('Second argument to indexOf is not a string or array');
};

export const arrayJoin = (sep: unknown, a: unknown): string => {
  assertArray(a, 'join');
  return a.join(sep as string);
};

export const sum = (array: unknown): number => {
  if (!Array.isArray(array)) {
    throw new Error('Sum argument is not an array');
  }
  return array.reduce((total: number, value) => total + Number(value), 0);
};
