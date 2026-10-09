import { KNOWN_DELTAS, SUITE_QUIRKS } from './known-deltas';

type Body = () => unknown;
type TestFn = (name: string, body?: Body, timeout?: number) => unknown;
type SuiteFn = (name: string, body: () => void) => unknown;

const isBaseline = process.env['CONFORMANCE_TARGET'] === 'expr-eval';
const originalDescribe = globalThis.describe as unknown as SuiteFn;
const originalIt = globalThis.it as unknown as TestFn & {
  fails: TestFn;
  skip: TestFn;
};
let suitePath: readonly string[] = [];

/**
 * Tracks the describe path so each `it` knows its full name. Vitest may run a
 * nested suite's body after its parent's body returned, so each suite captures
 * its full path when it is declared.
 */
const describe: SuiteFn = (name, body) => {
  const path = [...suitePath, name];
  return originalDescribe(name, () => {
    const parent = suitePath;
    suitePath = path;
    try {
      body();
    } finally {
      suitePath = parent;
    }
  });
};

/** Skips suite quirks, registers known deltas with `it.fails`, runs everything else normally. */
const it: TestFn = (name, body, timeout) => {
  const fullName = [...suitePath, name].join(' > ');
  if (Object.hasOwn(SUITE_QUIRKS, fullName)) {
    return originalIt.skip(name, body, timeout);
  }
  const isDelta = !isBaseline && Object.hasOwn(KNOWN_DELTAS, fullName);
  return isDelta
    ? originalIt.fails(name, body, timeout)
    : originalIt(name, body, timeout);
};

Object.assign(globalThis, { describe, it });
