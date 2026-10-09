import type { ExpressionNode } from '@exprit/core';

import { parseLegacy, type LegacyGrammar } from './parse';
import { printLegacy } from './print';

const grammar = (overrides: Partial<LegacyGrammar> = {}): LegacyGrammar => ({
  unaryOps: { '-': 0, '+': 0, '!': 0, not: 0, sin: 0, sqrt: 0, length: 0 },
  binaryOps: { and: 0, or: 0, in: 0 },
  ternaryOps: { '?': 0 },
  consts: { PI: Math.PI, true: true, false: false },
  isOperatorEnabled: () => true,
  allowMemberAccess: true,
  ...overrides,
});

const print = (source: string, options?: Partial<LegacyGrammar>): string =>
  printLegacy(parseLegacy(source, grammar(options)));

describe('parseLegacy', () => {
  it.each([
    ['1 + 2 * 3', '(1 + (2 * 3))'],
    ['2 ^ 3 ^ 2', '(2 ^ (3 ^ 2))'],
    ['-2 ^ 2', '(-(2 ^ 2))'],
    ['2 ^ -3', '(2 ^ (-3))'],
    ['3! ^ 2', '((3!) ^ 2)'],
    ['sin x ^ 2', '(sin (x ^ 2))'],
    ['sin(x) ^ 2', '((sin x) ^ 2)'],
    ['not a and b or c', '(((not a) and (b)) or (c))'],
    ['a < b == c', '((a < b) == c)'],
    ['a ? b : c ? d : e', '(a ? (b) : ((c ? (d) : (e))))'],
    ['x = y = 2', '(x = ((y = (2))))'],
    ['f(x) = x * 2; f(3)', '((f(x) = ((x * 2)));f(3))'],
    ['a.b.c[0]', 'a.b.c[0]'],
    ['"a" || "b"', '("a" || "b")'],
  ])('parses %s as %s', (source, printed) => {
    expect(print(source)).toBe(printed);
  });

  it('treats a prefix operator name before a delimiter as a function value', () => {
    const ast = parseLegacy('map(sqrt, xs)', grammar());
    expect(ast).toMatchObject({
      type: 'Call',
      arguments: [
        { type: 'Identifier', name: 'sqrt' },
        { type: 'Identifier', name: 'xs' },
      ],
    });
  });

  it('inlines constants at parse time', () => {
    expect(parseLegacy('PI', grammar())).toEqual<ExpressionNode>({
      type: 'Literal',
      value: Math.PI,
    });
  });

  it('turns a disabled operator into a parse error', () => {
    expect(() =>
      print('1 + 2', { isOperatorEnabled: (op) => op !== '+' }),
    ).toThrow(/\+/);
  });

  it('treats a disabled named operator as a plain name', () => {
    const ast = parseLegacy(
      'sin',
      grammar({ isOperatorEnabled: (op) => op !== 'sin' }),
    );
    expect(ast).toEqual({ type: 'Identifier', name: 'sin' });
  });

  it('rejects member access when disallowed', () => {
    expect(() => print('a.b', { allowMemberAccess: false })).toThrow(
      /member access is not permitted/,
    );
  });

  it.each(['a$x', '$', '$_x', '1a', '5/', '(', 'a b'])(
    'rejects %s',
    (source) => {
      expect(() => print(source)).toThrow(/parse error/);
    },
  );
});
