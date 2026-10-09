import type { ExpressionNode } from './ast';
import { compile } from './compile';
import { ExpressionSecurityError } from './errors';
import { evaluate } from './evaluate';
import { readMember } from './member-access';
import type { Registry } from './registry';
import { collectSymbols, simplify, substitute } from './transform';

const lit = (value: unknown): ExpressionNode => ({ type: 'Literal', value });
const id = (name: string): ExpressionNode => ({ type: 'Identifier', name });
const bin = (
  operator: string,
  left: ExpressionNode,
  right: ExpressionNode,
): ExpressionNode => ({
  type: 'Binary',
  operator,
  left,
  right,
});

/** A minimal registry so core is tested without the registry library. */
const registry: Registry = {
  unaryOps: { '-': (a: number) => -a, typeof: (a: unknown) => typeof a },
  binaryOps: {
    '+': (a: number, b: number) => a + b,
    '*': (a: number, b: number) => a * b,
  },
  functions: {},
  consts: {},
  methods: {
    array: ['map'],
    string: ['toUpperCase'],
    number: [],
    namespaces: new Set(),
  },
  resolveIdentifier: (name, scope) => {
    if (scope.locals && Object.hasOwn(scope.locals, name)) {
      return { found: true, value: scope.locals[name] };
    }
    return Object.hasOwn(scope.variables, name)
      ? { found: true, value: scope.variables[name] }
      : { found: false, message: `${name} is not defined` };
  },
};

const both = (
  node: ExpressionNode,
  variables: Record<string, unknown> = {},
): unknown => {
  const walked = evaluate(node, registry, { ...variables });
  expect(compile(node, registry)({ ...variables })).toEqual(walked);
  return walked;
};

describe('evaluate and compile', () => {
  it('apply registry operators', () => {
    expect(both(bin('+', lit(1), bin('*', id('x'), lit(3))), { x: 2 })).toBe(7);
  });

  it('short-circuit logical operators', () => {
    const boom: ExpressionNode = {
      type: 'Call',
      callee: id('boom'),
      arguments: [],
      optional: false,
    };
    const node: ExpressionNode = {
      type: 'Logical',
      operator: '&&',
      left: lit(0),
      right: boom,
    };
    expect(both(node)).toBe(0);
    expect(
      both({ type: 'Logical', operator: 'or', left: lit(1), right: boom }),
    ).toBe(true);
  });

  it('short-circuit a whole optional chain', () => {
    const chain: ExpressionNode = {
      type: 'Chain',
      expression: {
        type: 'Member',
        property: 'c',
        optional: false,
        object: {
          type: 'Member',
          object: id('a'),
          property: 'b',
          optional: true,
        },
      },
    };
    expect(both(chain, { a: null })).toBeUndefined();
    expect(both(chain, { a: { b: { c: 5 } } })).toBe(5);
  });

  it('close arrow functions over their parameters', () => {
    const arrow: ExpressionNode = {
      type: 'Arrow',
      params: ['v'],
      body: bin('*', id('v'), id('k')),
    };
    const call: ExpressionNode = {
      type: 'Call',
      callee: {
        type: 'Member',
        object: id('xs'),
        property: 'map',
        optional: false,
      },
      arguments: [arrow],
      optional: false,
    };
    expect(both(call, { xs: [1, 2], k: 10 })).toEqual([10, 20]);
  });

  it('build arrays, objects and templates with spreads', () => {
    const object: ExpressionNode = {
      type: 'Object',
      properties: [
        { type: 'Spread', argument: id('base') },
        {
          type: 'Property',
          key: lit('list'),
          computed: false,
          shorthand: false,
          value: {
            type: 'Array',
            elements: [lit(0), { type: 'Spread', argument: id('xs') }],
          },
        },
      ],
    };
    expect(both(object, { base: { a: 1 }, xs: [1, 2] })).toEqual({
      a: 1,
      list: [0, 1, 2],
    });
    expect(
      both(
        { type: 'Template', quasis: ['n=', '!'], expressions: [id('n')] },
        { n: 3 },
      ),
    ).toBe('n=3!');
  });

  it('answer typeof for unknown names without throwing', () => {
    expect(
      both({ type: 'Unary', operator: 'typeof', argument: id('missing') }),
    ).toBe('undefined');
    expect(() => evaluate(id('missing'), registry)).toThrow(
      'missing is not defined',
    );
  });

  it('write legacy assignments and function definitions into the variables', () => {
    const variables: Record<string, unknown> = {};
    const program: ExpressionNode = {
      type: 'Sequence',
      expressions: [
        {
          type: 'FunctionDefinition',
          name: 'twice',
          params: ['n'],
          body: bin('*', id('n'), lit(2)),
        },
        {
          type: 'Call',
          callee: id('twice'),
          arguments: [lit(21)],
          optional: false,
        },
      ],
    };
    expect(evaluate(program, registry, variables)).toBe(42);
    expect(typeof variables['twice']).toBe('function');
  });

  it('reject blocked names on identifiers, members and object keys', () => {
    expect(() =>
      evaluate(id('constructor'), registry, { constructor: 1 }),
    ).toThrow(ExpressionSecurityError);
    const key: ExpressionNode = {
      type: 'Object',
      properties: [
        {
          type: 'Property',
          key: lit('__proto__'),
          computed: true,
          shorthand: false,
          value: lit(1),
        },
      ],
    };
    expect(() => evaluate(key, registry)).toThrow(ExpressionSecurityError);
  });
});

describe('readMember', () => {
  const methods = registry.methods;

  it('reads own properties, string length and indices', () => {
    expect(readMember({ a: 1 }, 'a', methods)).toBe(1);
    expect(readMember('abc', 'length', methods)).toBe(3);
    expect(readMember('abc', '1', methods)).toBe('b');
    expect(readMember([5, 6], 1, methods)).toBe(6);
  });

  it('hides inherited properties and unlisted methods', () => {
    expect(readMember({}, 'toString', methods)).toBeUndefined();
    expect(readMember([], 'push', methods)).toBeUndefined();
    expect(readMember(() => 1, 'call', methods)).toBeUndefined();
  });

  it('binds whitelisted methods to their receiver', () => {
    const upper = readMember('abc', 'toUpperCase', methods) as () => string;
    expect(upper()).toBe('ABC');
  });

  it('throws on blocked names, symbols and nullish receivers', () => {
    expect(() => readMember({}, '__proto__', methods)).toThrow(
      ExpressionSecurityError,
    );
    expect(() => readMember({}, Symbol.iterator, methods)).toThrow(
      ExpressionSecurityError,
    );
    expect(() => readMember(null, 'a', methods)).toThrow(
      /Cannot read properties of null/,
    );
  });
});

describe('transforms', () => {
  it('simplify folds literal operands and inlines values', () => {
    expect(
      simplify(bin('+', bin('*', lit(2), lit(3)), id('x')), registry),
    ).toEqual(bin('+', lit(6), id('x')));
    expect(simplify(bin('+', id('x'), lit(1)), registry, { x: 2 })).toEqual(
      lit(3),
    );
  });

  it('substitute leaves arrow parameters alone', () => {
    const arrow: ExpressionNode = {
      type: 'Arrow',
      params: ['x'],
      body: bin('+', id('x'), id('y')),
    };
    expect(substitute(bin('*', id('x'), arrow), 'x', lit(9))).toEqual(
      bin('*', lit(9), arrow),
    );
  });

  it('collectSymbols lists free names in order, with optional member paths', () => {
    const node = bin(
      '+',
      { type: 'Member', object: id('user'), property: 'age', optional: false },
      id('x'),
    );
    expect(collectSymbols(node)).toEqual(['user', 'x']);
    expect(collectSymbols(node, { withMembers: true })).toEqual([
      'user.age',
      'x',
    ]);
  });
});
