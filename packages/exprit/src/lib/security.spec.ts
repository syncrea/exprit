import { createRequire } from 'node:module';

import { ExpressionLimitError, ExpressionSyntaxError } from '@exprit/core';
import { DEFAULT_SAFE_METHODS } from '@exprit/registry';

import { compile, evaluate, parse, print, simplify } from './api';
import { CompatParser as Parser } from './compat-parser';
import { createEnvironment } from './environment';

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

  it('does not let an expression choose the receiver of a host method (F4)', () => {
    const account = {
      owner: 'host',
      describe(this: { owner?: string } | undefined): string {
        return this?.owner ?? 'no receiver';
      },
    };
    // Array-callback thisArg is still dropped, for map and flatMap.
    expect(
      modern.evaluate('[0].map(account.describe, { owner: "attacker" })', {
        account,
      }),
    ).toEqual(['no receiver']);
    expect(
      modern.evaluate('[0].flatMap(account.describe, { owner: "attacker" })', {
        account,
      }),
    ).toEqual(['no receiver']);
    // A method copied onto an attacker-built object literal is called with no
    // receiver, not the literal the attacker crafted.
    for (const run of [
      (source: string): unknown => modern.evaluate(source, { account }),
      (source: string): unknown => modern.parse(source).compile()({ account }),
    ]) {
      expect(run('({ m: account.describe, owner: "x" }).m()')).toBe(
        'no receiver',
      );
      // A host object passed as a variable keeps its natural receiver.
      expect(run('account.describe()')).toBe('host');
    }
  });

  it('keeps the shared safe-method whitelist frozen', () => {
    expect(Object.isFrozen(DEFAULT_SAFE_METHODS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SAFE_METHODS.array)).toBe(true);
  });
});

// F2: the modern dialect used to ignore these switches, giving a false sense
// of safety. Both must now be honoured in parse, evaluate and compile.
describe('modern dialect honours hardening switches (F2)', () => {
  const noMembers = createEnvironment({
    dialect: 'modern',
    allowMemberAccess: false,
  });

  it.each([
    'a.b',
    'a?.b',
    'a["b"]',
    'a?.["b"]',
    '"x".toUpperCase()',
    'obj.method()',
  ])('rejects member access %s when allowMemberAccess is false', (source) => {
    expect(() => parse(source, noMembers)).toThrow(/member access/);
  });

  it('still allows plain calls and array literals without member access', () => {
    expect(
      evaluate(parse('f(2)', noMembers), { f: (n: number) => n + 1 }),
    ).toBe(3);
    expect(evaluate(parse('[1, 2, 3]', noMembers))).toEqual([1, 2, 3]);
  });

  it.each<[string, Record<string, boolean>]>([
    ['2 * 3', { multiply: false }],
    ['2 + 3', { add: false }],
    ['2 - 3', { subtract: false }],
    ['2 ** 3', { power: false }],
    ['2 < 3', { comparison: false }],
    ['a && b', { logical: false }],
    ['a ?? b', { logical: false }],
    ['a ? b : c', { conditional: false }],
    ['[1, 2]', { array: false }],
    ['a[0]', { array: false }],
  ])('rejects %s when its operator is disabled', (source, operators) => {
    const env = createEnvironment({ dialect: 'modern', operators });
    expect(() => parse(source, env)).toThrow(/disabled|member access/);
  });

  it('leaves unrelated operators working when one is disabled', () => {
    const env = createEnvironment({
      dialect: 'modern',
      operators: { multiply: false },
    });
    expect(evaluate(parse('2 + 3', env))).toBe(5);
    expect(compile(parse('2 + 3', env))()).toBe(5);
  });
});

// F1: a short expression could allocate an uncatchable amount of memory. The
// amplifying methods and string/array growth must throw a catchable
// ExpressionLimitError before the allocation, in both evaluate and compile.
describe('resource limits stop memory exhaustion (F1)', () => {
  const modern = createEnvironment({ dialect: 'modern' });
  const legacy = createEnvironment();

  const bothThrow = (
    source: string,
    env = modern,
    vars: Record<string, unknown> = {},
  ): void => {
    expect(() => evaluate(parse(source, env), vars)).toThrow(
      ExpressionLimitError,
    );
    expect(() => compile(parse(source, env))(vars)).toThrow(
      ExpressionLimitError,
    );
  };

  it.each([
    '"x".padStart(300000000)',
    '"x".padStart(300000000).split("")',
    '"a".repeat(1000000000)',
    '"x".padEnd(99999999)',
    '"ab".repeat(500000000)',
    '"a,b".repeat(20000000).split(",")',
  ])('rejects amplifying string method %s', (source) => {
    bothThrow(source);
  });

  it('rejects string concatenation past the limit', () => {
    const base = { s: 'x'.repeat(6_000_000) };
    bothThrow('s + s', modern, base);
    bothThrow('`${s}${s}`', modern, base);
    bothThrow('s || s', legacy, base);
  });

  it('rejects array growth past the limit', () => {
    const big = { a: new Array(6_000_000).fill(0) };
    bothThrow('a.concat(a)', modern, big);
    bothThrow('[...a, ...a]', modern, big);
    bothThrow('[a, a].flat()', modern, { a: big.a });
  });

  it('honours a custom lower limit and leaves normal use working', () => {
    const tight = createEnvironment({
      dialect: 'modern',
      limits: { maxStringLength: 100 },
    });
    expect(() => evaluate(parse('"x".repeat(1000)', tight))).toThrow(
      ExpressionLimitError,
    );
    expect(evaluate(parse('"x".repeat(50)', tight))).toHaveLength(50);
  });

  it('lets Infinity disable a limit', () => {
    const unlimited = createEnvironment({
      dialect: 'modern',
      limits: { maxStringLength: Infinity },
    });
    expect(evaluate(parse('"x".repeat(1000000)', unlimited))).toHaveLength(
      1_000_000,
    );
  });

  it('enforces a step budget in evaluate and compile', () => {
    const budgeted = createEnvironment({
      dialect: 'modern',
      limits: { maxSteps: 50 },
    });
    const source = 'items.map(x => x * 2).map(x => x + 1)';
    const vars = { items: new Array(1000).fill(1) };
    expect(() => evaluate(parse(source, budgeted), vars)).toThrow(
      ExpressionLimitError,
    );
    expect(() => compile(parse(source, budgeted))(vars)).toThrow(
      ExpressionLimitError,
    );
  });
});

// F3: deeply nested or long-chained input overflowed the stack across parse,
// evaluate, compile, print and simplify. The parser now fails fast.
describe('parser depth and length limits (F3)', () => {
  it.each<['legacy' | 'modern']>([['legacy'], ['modern']])(
    'rejects deeply nested input in the %s dialect',
    (dialect) => {
      const env = createEnvironment({ dialect });
      const nested = '('.repeat(5000) + '1' + ')'.repeat(5000);
      expect(() => parse(nested, env)).toThrow(ExpressionSyntaxError);
      expect(() => parse(nested, env)).toThrow(/nested too deeply/);
    },
  );

  it('rejects a long left-associative chain before it builds a deep tree', () => {
    expect(() => parse('1' + '+1'.repeat(10000))).toThrow(/nested too deeply/);
  });

  it('rejects source longer than the limit', () => {
    const env = createEnvironment({ limits: { maxSourceLength: 100 } });
    expect(() => parse('1 + '.repeat(100) + '1', env)).toThrow(/too long/);
  });

  it('accepts ordinary nesting within the limit', () => {
    expect(evaluate(parse('((((1 + 2))))'))).toBe(3);
  });
});

// F5: coercing a host function to a string used to reveal its full source.
describe('does not disclose host function source (F5)', () => {
  const secretFn = function hostFn(x: number): number {
    const secret = 'sk-live-TOPSECRET';
    return x + secret.length;
  };
  const modern = createEnvironment({ dialect: 'modern' });

  it.each<[string, Record<string, unknown>]>([
    ['String(f)', { f: secretFn }],
    ['`${f}`', { f: secretFn }],
    ['f + ""', { f: secretFn }],
  ])('masks the function in %s', (source, vars) => {
    expect(evaluate(parse(source, modern), vars)).toBe('[Function]');
    expect(compile(parse(source, modern))(vars)).toBe('[Function]');
  });

  it('masks a function inlined by simplify and printed', () => {
    const printed = print(simplify(parse('x', modern), { x: secretFn }));
    expect(printed).not.toContain('TOPSECRET');
    expect(printed).toContain('[Function]');
  });

  it('masks a function concatenated in the legacy dialect', () => {
    expect(evaluate(parse('f || "!"'), { f: secretFn })).toBe('[Function]!');
  });
});
