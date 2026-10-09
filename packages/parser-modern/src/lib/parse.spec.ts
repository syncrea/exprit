import { parseModern } from './parse';
import { printModern } from './print';

const print = (source: string): string => printModern(parseModern(source));

describe('parseModern', () => {
  it.each([
    ['1 + 2 * 3', '(1 + (2 * 3))'],
    ['2 ** 3 ** 2', '(2 ** (3 ** 2))'],
    ['(-2) ** 2', '((-2) ** 2)'],
    ['a && b || c', '((a && b) || c)'],
    ['a ?? (b || c)', '(a ?? (b || c))'],
    ['a === b ? c : d ? e : f', '((a === b) ? c : (d ? e : f))'],
    ['!a.b', '(!a.b)'],
    ['typeof x === "string"', '((typeof x) === "string")'],
    ['a?.b.c', 'a?.b.c'],
    ['a?.[0]?.(1)', 'a?.[0]?.(1)'],
    ['f(...xs, 1)', 'f(...xs, 1)'],
    ['[1, ...rest,]', '[1, ...rest]'],
    ['({ a, "b-c": 1, [k]: 2, ...o })', '({ a, "b-c": 1, [k]: 2, ...o })'],
    ['xs.map(x => x * 2)', 'xs.map(((x) => (x * 2)))'],
    ['((a, b) => a + b)(1, 2)', '((a, b) => (a + b))(1, 2)'],
    ['() => 1', '(() => 1)'],
    ['`a${b}c`', '`a${b}c`'],
    ['1_000 + 0x10', '(1000 + 16)'],
  ])('parses %s as %s', (source, printed) => {
    expect(print(source)).toBe(printed);
  });

  it('wraps an optional chain so it can short-circuit as a whole', () => {
    expect(parseModern('a?.b.c')).toMatchObject({
      type: 'Chain',
      expression: {
        type: 'Member',
        property: 'c',
        object: { type: 'Member', optional: true },
      },
    });
  });

  it('parses keyword literals', () => {
    expect(parseModern('[true, false, null, undefined]')).toMatchObject({
      elements: [
        { value: true },
        { value: false },
        { value: null },
        { value: undefined },
      ],
    });
  });

  it.each([
    ['a = 1', /Assignment is not supported/],
    ['a == 1', /Use "==="/],
    ['a != 1', /Use "!=="/],
    ['-2 ** 2', /Parenthesize the unary operand/],
    ['a ?? b || c', /Cannot mix/],
    ['a || b ?? c', /Cannot mix/],
    ['new Date()', /"new" is not supported/],
    ['a; b', /Statements are not supported/],
    ['[1,,2]', /Array holes/],
    ['x => { return x }', /expression body/],
    ['(a, a) => a', /Duplicate parameter/],
    ['(constructor) => 1', /cannot be used as a parameter name/],
    ['a and b', /Unexpected/],
  ])('rejects %s', (source, message) => {
    expect(() => parseModern(source)).toThrow(message);
  });
});
