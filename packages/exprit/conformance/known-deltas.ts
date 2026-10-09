/**
 * expr-eval tests that exprit deliberately does not pass, keyed by the test's
 * full name (`describe` titles and the `it` title joined with " > ").
 *
 * Each entry is a documented difference, see docs/differences-from-expr-eval.md.
 * The setup file registers these tests with `it.fails`, so the suite goes red
 * if one of them unexpectedly starts passing and the entry can be removed.
 */
export const KNOWN_DELTAS: Readonly<Record<string, string>> = {};

/**
 * Tests that cannot run under vitest for either target, e.g. mocha-only
 * patterns such as an `it` nested inside another `it`. They are skipped.
 */
export const SUITE_QUIRKS: Readonly<Record<string, string>> = {
  'Expression > toJSFunction() > floor(random() * 10)':
    'nests an `it` inside an `it`, which mocha silently ignores and vitest rejects',
};
