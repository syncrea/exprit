import {
  compile,
  evaluate,
  evaluateWithState,
  parse,
  print,
  simplify,
  substitute,
  symbols,
  toFunction,
  variables,
} from './api';
import { createEnvironment, DEFAULT_ENVIRONMENT, extend } from './environment';

const modern = createEnvironment({ dialect: 'modern' });

describe('functional API (modern dialect)', () => {
  const run = (source: string, values: Record<string, unknown> = {}): unknown =>
    evaluate(parse(source, modern), values);

  it.each<[string, unknown, Record<string, unknown>?]>([
    ['1 + 2 * 3', 7],
    ['"a" + 1', 'a1'],
    ['2 ** 10', 1024],
    ['5 % 3 === 2 && !false', true],
    ['null ?? "fallback"', 'fallback'],
    ['0 || "zero"', 'zero'],
    ['x > 2 ? "big" : "small"', 'big', { x: 3 }],
    ['user.name', 'Ada', { user: { name: 'Ada' } }],
    ['user?.address?.city', undefined, { user: {} }],
    ['user?.address.city', undefined, { user: null }],
    [
      'items.filter(x => x > 1).map(x => x * 10)',
      [20, 30],
      { items: [1, 2, 3] },
    ],
    ['items.reduce((sum, x) => sum + x, 0)', 6, { items: [1, 2, 3] }],
    ['[...items, 4].length', 4, { items: [1, 2, 3] }],
    ['({ ...base, b: 2 })', { a: 1, b: 2 }, { base: { a: 1 } }],
    ['`Hello ${name.toUpperCase()}!`', 'Hello ADA!', { name: 'ada' }],
    ['Math.max(...xs)', 3, { xs: [1, 3, 2] }],
    ['Number.isInteger(4.0) && Number("2") === 2', true],
    ['typeof missing', 'undefined'],
    ['roundTo(PI, 2)', 3.14],
    ['(1.005).toFixed(1)', '1.0'],
  ])('evaluates %s', (source, expected, values) => {
    expect(run(source, values)).toEqual(expected);
  });

  it('throws a ReferenceError-style message for unknown names', () => {
    expect(() => run('nope + 1')).toThrow('nope is not defined');
  });

  it('throws when reading through null without optional chaining', () => {
    expect(() => run('user.address.city', { user: {} })).toThrow(
      /Cannot read properties of undefined/,
    );
  });

  it('lets variables shadow globals', () => {
    expect(run('Math', { Math: 42 })).toBe(42);
  });

  it('uses functions from the environment', () => {
    const env = extend(modern, { functions: { double: (x: number) => x * 2 } });
    expect(evaluate(parse('double(21)', env))).toBe(42);
  });

  it('reports variables without globals, consts, functions or arrow parameters', () => {
    expect(variables(parse('Math.max(a, b.c) + PI + min(d)', modern))).toEqual([
      'a',
      'b',
      'd',
    ]);
    expect(
      variables(parse('Math.max(a, b.c)', modern), { withMembers: true }),
    ).toEqual(['a', 'b.c']);
    expect(variables(parse('xs.map(x => x + y)', modern))).toEqual(['xs', 'y']);
  });

  it('prints back to modern-dialect source', () => {
    expect(print(parse('a?.b ?? `x${1}`', modern))).toBe('(a?.b ?? `x${1}`)');
  });
});

describe('functional API (legacy dialect)', () => {
  it('defaults to the legacy dialect with the built-ins', () => {
    expect(evaluate(parse('2 ^ x + fac(3)'), { x: 3 })).toBe(14);
    expect(DEFAULT_ENVIRONMENT.dialect).toBe('legacy');
  });

  it('simplifies, substitutes and prints like expr-eval', () => {
    const expr = parse('x ^ 2 + y');
    expect(print(simplify(expr, { y: 1 }))).toBe('((x ^ 2) + 1)');
    expect(print(substitute(expr, 'x', 'a + 1'))).toBe('(((a + 1) ^ 2) + y)');
    expect(print(substitute(expr, 'x', parse('2')))).toBe('((2 ^ 2) + y)');
    expect(symbols(parse('min(a, b)'))).toEqual(['min', 'a', 'b']);
    expect(variables(parse('min(a, b)'))).toEqual(['a', 'b']);
  });

  it('honours operator switches and member access options', () => {
    const strict = createEnvironment({
      operators: { add: false },
      allowMemberAccess: false,
    });
    expect(() => parse('1 + 2', strict)).toThrow(/\+/);
    expect(() => parse('a.b', strict)).toThrow(/member access/);
  });

  it('turns expressions into plain functions', () => {
    const area = toFunction(parse('w * h * k'), ['w', 'h'], { k: 2 });
    expect(area(2, 3)).toBe(12);
  });

  it('compiles to a function that matches evaluate', () => {
    const expr = parse('x ^ 2 + sin(y) * (z > 1 ? 10 : 20)');
    const values = { x: -3, y: Math.PI / 2, z: 5 };
    expect(compile(expr)(values)).toBe(evaluate(expr, values));
  });
});

describe('immutability', () => {
  it('freezes environments, expressions and syntax trees', () => {
    const expr = parse('a + b * c');
    expect(Object.isFrozen(DEFAULT_ENVIRONMENT)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ENVIRONMENT.functions)).toBe(true);
    expect(Object.isFrozen(expr)).toBe(true);
    expect(Object.isFrozen(expr.ast)).toBe(true);
    const ast = expr.ast as { right?: object };
    expect(Object.isFrozen(ast.right)).toBe(true);
  });

  it('derives new environments without touching the base', () => {
    const base = createEnvironment();
    const withTau = extend(base, { consts: { TAU: 2 * Math.PI } });
    expect(evaluate(parse('TAU / 2', withTau))).toBe(Math.PI);
    expect(Object.hasOwn(base.consts, 'TAU')).toBe(false);
    expect(() => parse('TAU', base)).not.toThrow();
    expect(() => evaluate(parse('TAU', base))).toThrow(/undefined variable/);
  });

  it('returns new expressions from simplify and substitute', () => {
    const expr = parse('x + 1');
    const simplified = simplify(expr, { x: 1 });
    expect(print(expr)).toBe('(x + 1)');
    expect(print(simplified)).toBe('2');
  });

  it('never modifies the variables, even for legacy assignments', () => {
    const values = Object.freeze({ y: 1 });
    expect(evaluate(parse('x = 4; x * 2 + y'), values)).toBe(9);
    expect(compile(parse('x = 4; x'))(values)).toBe(4);
    expect(values).toEqual({ y: 1 });
  });

  it('returns the variables after evaluation as a new frozen object', () => {
    const before = { y: 1 };
    const state = evaluateWithState(parse('f(n) = n * 2; x = f(y)'), before);
    expect(state.value).toBe(2);
    expect(state.variables['x']).toBe(2);
    expect(typeof state.variables['f']).toBe('function');
    expect(Object.isFrozen(state.variables)).toBe(true);
    expect(before).toEqual({ y: 1 });
  });

  it('does not freeze values the caller inlined with simplify', () => {
    const items = [1, 2];
    simplify(parse('xs'), { xs: items });
    expect(Object.isFrozen(items)).toBe(false);
  });
});
