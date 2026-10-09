import {
  add,
  sub,
  mul,
  div,
  mod,
  pow,
  concat,
  equal,
  notEqual,
  greaterThan,
  lessThan,
  greaterThanEqual,
  lessThanEqual,
  andOperator,
  orOperator,
  inOperator,
  neg,
  not,
  random,
  gamma,
  factorial,
  stringOrArrayLength,
  condition,
  roundTo,
  arrayIndex,
  max,
  min,
  arrayMap,
  arrayFold,
  arrayFilter,
  stringOrArrayIndexOf,
  arrayJoin,
  sum,
} from './lib/legacy-functions';

export * from './lib/globals';
export * from './lib/legacy';
export * from './lib/modern';
export * from './lib/safe-methods';

/**
 * expr-eval's operator and function implementations, as the legacy dialect
 * uses them. Listed by name on purpose: a namespace import or `export * as`
 * makes the bundled CommonJS type declarations reference a runtime helper
 * that does not exist in them.
 */
export const legacyFunctions = Object.freeze({
  add,
  sub,
  mul,
  div,
  mod,
  pow,
  concat,
  equal,
  notEqual,
  greaterThan,
  lessThan,
  greaterThanEqual,
  lessThanEqual,
  andOperator,
  orOperator,
  inOperator,
  neg,
  not,
  random,
  gamma,
  factorial,
  stringOrArrayLength,
  condition,
  roundTo,
  arrayIndex,
  max,
  min,
  arrayMap,
  arrayFold,
  arrayFilter,
  stringOrArrayIndexOf,
  arrayJoin,
  sum,
});
