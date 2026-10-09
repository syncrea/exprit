import { ExpressionSyntaxError, type Token } from '@exprit/core';

import { LEGACY_TOKENIZER_CONFIG, MODERN_TOKENIZER_CONFIG } from './config';
import { tokenize } from './tokenize';

const summarize = (tokens: readonly Token[]): string[] =>
  tokens
    .filter((t) => t.type !== 'eof')
    .map((t) => `${t.type}:${String(t.value)}`);

describe('tokenize', () => {
  describe('legacy config', () => {
    const lex = (source: string): string[] =>
      summarize(tokenize(source, LEGACY_TOKENIZER_CONFIG));

    it('reads numbers, radix integers and exponents', () => {
      expect(lex('1 .5 2.5e3 0x1F 0b101')).toEqual([
        'number:1',
        'number:0.5',
        'number:2500',
        'number:31',
        'number:5',
      ]);
    });

    it('leaves an incomplete exponent to the next token', () => {
      expect(lex('2e')).toEqual(['number:2', 'identifier:e']);
    });

    it('prefers the longest punctuator and maps the bullet operators', () => {
      expect(lex('a>=b||c != d • e')).toEqual([
        'identifier:a',
        'punctuator:>=',
        'identifier:b',
        'punctuator:||',
        'identifier:c',
        'punctuator:!=',
        'identifier:d',
        'punctuator:*',
        'identifier:e',
      ]);
    });

    it('skips block comments, including an unterminated one', () => {
      expect(lex('1 /* x */ + 2 /* open')).toEqual([
        'number:1',
        'punctuator:+',
        'number:2',
      ]);
    });

    it('resolves legacy escapes and rejects unknown ones', () => {
      expect(lex(String.raw`'a\nA'`)).toEqual(['string:a\nA']);
      expect(() => tokenize(String.raw`'\q'`, LEGACY_TOKENIZER_CONFIG)).toThrow(
        /Illegal escape/,
      );
    });

    it('reports unknown characters with line and column', () => {
      expect(() => tokenize('1 +\n 2 @', LEGACY_TOKENIZER_CONFIG)).toThrow(
        'parse error [2:4]',
      );
      expect(() => tokenize('@', LEGACY_TOKENIZER_CONFIG)).toThrow(
        ExpressionSyntaxError,
      );
    });
  });

  describe('modern config', () => {
    const lex = (source: string): string[] =>
      summarize(tokenize(source, MODERN_TOKENIZER_CONFIG));

    it('reads numeric separators and octal literals', () => {
      expect(lex('1_000 0o17')).toEqual(['number:1000', 'number:15']);
    });

    it('distinguishes optional chaining from a conditional before a number', () => {
      expect(lex('a?.b')).toEqual([
        'identifier:a',
        'punctuator:?.',
        'identifier:b',
      ]);
      expect(lex('a?.5:1')).toEqual([
        'identifier:a',
        'punctuator:?',
        'number:0.5',
        'punctuator::',
        'number:1',
      ]);
    });

    it('splits template literals around nested substitutions', () => {
      const tokens = tokenize(
        '`a${ {x: `b${1}`}.x }c`',
        MODERN_TOKENIZER_CONFIG,
      );
      const parts = tokens.flatMap((t) =>
        t.type === 'template' ? [`${t.part}:${t.value}`] : [],
      );
      expect(parts).toEqual(['head:a', 'head:b', 'tail:', 'tail:c']);
    });

    it('skips line comments', () => {
      expect(lex('1 // one\n+ 2')).toEqual([
        'number:1',
        'punctuator:+',
        'number:2',
      ]);
    });

    it('rejects an unterminated block comment', () => {
      expect(() => tokenize('1 /* open', MODERN_TOKENIZER_CONFIG)).toThrow(
        /Unterminated comment/,
      );
    });
  });
});
