import { createRequire } from 'node:module';

import { DEFAULT_SAFE_METHODS } from '@exprit/registry';

import { CompatParser as Parser } from './compat-parser';

interface SloppyHost {
  readonly step: (cb: () => unknown) => unknown;
  readonly start: (cb: () => unknown) => unknown;
}

const sloppyHost = createRequire(import.meta.url)(
  './fixtures/sloppy-host.cjs',
) as SloppyHost;

/**
 * Payloads that reach the Function constructor, a prototype or global state
 * in naive evaluators. Every one must fail or be harmless in both dialects.
 */
describe('sandboxing', () => {
  const legacy = new Parser();
  const modern = new Parser({ dialect: 'modern' });

  afterEach(() => {
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it.each([
    'constructor',
    '__proto__',
    'x.constructor',
    'x.__proto__',
    'x.prototype',
    'f.constructor',
    'toString',
    'valueOf',
  ])('legacy rejects %s', (source) => {
    expect(() => legacy.evaluate(source, { x: {}, f: () => 1 })).toThrow();
  });

  it.each([
    'constructor',
    'x.constructor',
    'x["constructor"]',
    'x["__proto__"]',
    '"".constructor',
    '[].constructor',
    '(() => 1).constructor',
    'Math.constructor',
    'Number.constructor',
    'Number.prototype',
    '[].map.constructor("return process")()',
    'x[["constructor"]]',
    '({ __proto__: { polluted: 1 } })',
    '({ ["__pro" + "to__"]: 1 })',
    '(constructor => 1)',
  ])('modern rejects %s', (source) => {
    expect(() => modern.evaluate(source, { x: {} })).toThrow();
  });

  it('does not expose inherited properties of user objects', () => {
    expect(modern.evaluate('x.hasOwnProperty', { x: {} })).toBeUndefined();
    expect(modern.evaluate('x.toString', { x: {} })).toBeUndefined();
  });

  it('does not expose properties of bound methods', () => {
    expect(modern.evaluate('[].map.call', {})).toBeUndefined();
  });

  it('cannot mutate the data it is given', () => {
    const items = [3, 1, 2];
    expect(modern.evaluate('items.toSorted()', { items })).toEqual([1, 2, 3]);
    expect(() => modern.evaluate('items.sort()', { items })).toThrow(
      /is not a function/,
    );
    expect(items).toEqual([3, 1, 2]);
  });

  it('treats a parsed "__proto__" key from JSON as plain data', () => {
    expect(
      modern.evaluate('JSON.parse(text).polluted', {
        text: '{"__proto__":{"polluted":1}}',
      }),
    ).toBeUndefined();
  });

  it('never generates code in toJSFunction', () => {
    const fn = legacy.parse('x || "); process.exit(1); ("').toJSFunction('x');
    expect(fn('a')).toBe('a); process.exit(1); (');
  });

  // Regressions found by the sandbox-reviewer agent.
  describe('host function internals', () => {
    it('cannot climb the host call stack through caller or arguments', () => {
      expect(() =>
        modern.evaluate('start(() => step.caller.arguments[0])', {
          ...sloppyHost,
        }),
      ).toThrow(/not allowed/);
      expect(modern.evaluate('step.length', { ...sloppyHost })).toBeUndefined();
      const parser = new Parser();
      Object.assign(parser.functions, { ...sloppyHost });
      expect(() =>
        parser.evaluate('g() = step.caller.arguments[0]; start(g)'),
      ).toThrow(/not allowed/);
    });

    it('still reads members of the registry namespaces', () => {
      expect(modern.evaluate('Number.MAX_SAFE_INTEGER > 0')).toBe(true);
    });
  });

  it.each([
    '({ ...JSON.parse(\'{"__proto__":{"isAdmin":true}}\') })',
    '({ ...Object.fromEntries([["__proto__", {}]]) })',
  ])('cannot set a prototype through spread: %s', (source) => {
    expect(() => modern.evaluate(source)).toThrow(/not allowed/);
  });

  it('rejects blocked names as legacy function or parameter names', () => {
    expect(() => legacy.parse('f(__proto__) = 1')).toThrow(/cannot be used/);
    expect(() => legacy.parse('constructor(x) = 1')).toThrow(/cannot be used/);
  });

  it('does not let an expression choose the receiver of a host method', () => {
    const account = {
      owner: 'host',
      describe(this: { owner?: string } | undefined): string {
        return this?.owner ?? 'no receiver';
      },
    };
    expect(
      modern.evaluate('[0].map(account.describe, { owner: "attacker" })', {
        account,
      }),
    ).toEqual(['no receiver']);
  });

  it('keeps the shared safe-method whitelist frozen', () => {
    expect(Object.isFrozen(DEFAULT_SAFE_METHODS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SAFE_METHODS.array)).toBe(true);
  });
});
