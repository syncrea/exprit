import {
  ExpressionSyntaxError,
  type TemplatePart,
  type Token,
} from '@exprit/core';

import type { RadixPrefix, TokenizerConfig } from './config';

const RADIX: Readonly<Record<RadixPrefix, number>> = { x: 16, o: 8, b: 2 };

const DIGIT_PATTERN: Readonly<Record<RadixPrefix, RegExp>> = {
  x: /[0-9a-f]/i,
  o: /[0-7]/,
  b: /[01]/,
};

const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/** A cased letter, matching how expr-eval detects letters, or any Unicode letter. */
const isLetter = (c: string): boolean =>
  c !== '' && (c.toUpperCase() !== c.toLowerCase() || /\p{L}/u.test(c));

const isIdentifierStart = (c: string): boolean =>
  isLetter(c) || c === '_' || c === '$';

const isIdentifierPart = (c: string): boolean =>
  isIdentifierStart(c) || isDigit(c);

const isWhitespace = (c: string): boolean => /\s/.test(c) && c !== '';

/**
 * Splits `source` into tokens following the lexical rules in `config`.
 *
 * @throws ExpressionSyntaxError on characters or literals the dialect does not allow
 */
export const tokenize = (
  source: string,
  config: TokenizerConfig,
): readonly Token[] => {
  const punctuators = [...config.punctuators].sort(
    (a, b) => b.length - a.length,
  );
  const tokens: Token[] = [];
  // Open `{` and `${` delimiters, so a `}` knows whether it resumes a template.
  const braces: ('brace' | 'template')[] = [];
  let pos = 0;

  const fail = (reason: string, at: number = pos): never => {
    throw new ExpressionSyntaxError(reason, source, at);
  };

  const skipTrivia = (): void => {
    for (;;) {
      const c = source.charAt(pos);
      if (isWhitespace(c)) {
        pos++;
      } else if (c === '/' && source.charAt(pos + 1) === '*') {
        const end = source.indexOf('*/', pos + 2);
        if (end < 0) {
          if (config.strictBlockComments) {
            fail('Unterminated comment');
          }
          pos = source.length;
        } else {
          pos = end + 2;
        }
      } else if (
        config.lineComments &&
        c === '/' &&
        source.charAt(pos + 1) === '/'
      ) {
        const end = source.indexOf('\n', pos);
        pos = end < 0 ? source.length : end;
      } else {
        return;
      }
    }
  };

  const readHex = (from: number, length: number): number => {
    const hex = source.substring(from, from + length);
    if (!new RegExp(`^[0-9a-f]{${length}}$`, 'i').test(hex)) {
      fail(`Illegal escape sequence: \\${source.charAt(from - 1)}${hex}`, from);
    }
    return parseInt(hex, 16);
  };

  /** Reads one escape sequence starting after the backslash and returns its text. */
  const readEscape = (): string => {
    const c = source.charAt(pos);
    pos++;
    switch (c) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case "'":
      case '"':
      case '\\':
      case '/':
        return c;
      case 'u': {
        if (config.escapes === 'javascript' && source.charAt(pos) === '{') {
          const end = source.indexOf('}', pos);
          const hex = end < 0 ? '' : source.substring(pos + 1, end);
          if (!/^[0-9a-f]{1,6}$/i.test(hex)) {
            fail('Illegal escape sequence: \\u{', pos);
          }
          pos = end + 1;
          return String.fromCodePoint(parseInt(hex, 16));
        }
        const code = readHex(pos, 4);
        pos += 4;
        return String.fromCharCode(code);
      }
    }
    if (config.escapes === 'legacy') {
      return fail(`Illegal escape sequence: "\\${c}"`, pos - 1);
    }
    switch (c) {
      case 'v':
        return '\v';
      case '0':
        return '\0';
      case 'x': {
        const code = readHex(pos, 2);
        pos += 2;
        return String.fromCharCode(code);
      }
      case '\r':
        if (source.charAt(pos) === '\n') {
          pos++;
        }
        return '';
      case '\n':
      case '\u2028':
      case '\u2029':
        return '';
      default:
        return c;
    }
  };

  const readString = (quote: string): void => {
    const start = pos;
    pos++;
    let value = '';
    for (;;) {
      if (pos >= source.length) {
        fail(`Unterminated string`, start);
      }
      const c = source.charAt(pos);
      if (c === quote) {
        pos++;
        break;
      }
      if (c === '\\') {
        pos++;
        value += readEscape();
      } else {
        value += c;
        pos++;
      }
    }
    tokens.push({
      type: 'string',
      value,
      raw: source.slice(start, pos),
      start,
      end: pos,
    });
  };

  /** Reads template text up to the closing backtick or the next `${`. */
  const readTemplate = (start: number, opensWithBacktick: boolean): void => {
    let value = '';
    for (;;) {
      if (pos >= source.length) {
        fail('Unterminated template literal', start);
      }
      const c = source.charAt(pos);
      if (c === '`') {
        pos++;
        const part: TemplatePart = opensWithBacktick ? 'full' : 'tail';
        tokens.push({
          type: 'template',
          part,
          value,
          raw: source.slice(start, pos),
          start,
          end: pos,
        });
        return;
      }
      if (c === '$' && source.charAt(pos + 1) === '{') {
        pos += 2;
        braces.push('template');
        const part: TemplatePart = opensWithBacktick ? 'head' : 'middle';
        tokens.push({
          type: 'template',
          part,
          value,
          raw: source.slice(start, pos),
          start,
          end: pos,
        });
        return;
      }
      if (c === '\\') {
        pos++;
        value += readEscape();
      } else {
        value += c;
        pos++;
      }
    }
  };

  const readRadixInteger = (): boolean => {
    const prefix = source.charAt(pos + 1).toLowerCase() as RadixPrefix;
    if (source.charAt(pos) !== '0' || !config.radixPrefixes.includes(prefix)) {
      return false;
    }
    let end = pos + 2;
    while (
      end < source.length &&
      DIGIT_PATTERN[prefix].test(source.charAt(end))
    ) {
      end++;
    }
    if (end === pos + 2) {
      return false;
    }
    const raw = source.slice(pos, end);
    tokens.push({
      type: 'number',
      value: parseInt(raw.slice(2), RADIX[prefix]),
      raw,
      start: pos,
      end,
    });
    pos = end;
    return true;
  };

  const readDigits = (from: number): number => {
    let end = from;
    while (
      isDigit(source.charAt(end)) ||
      (config.numericSeparators &&
        source.charAt(end) === '_' &&
        isDigit(source.charAt(end - 1)) &&
        isDigit(source.charAt(end + 1)))
    ) {
      end++;
    }
    return end;
  };

  const readNumber = (): boolean => {
    const start = pos;
    let end = readDigits(pos);
    const hasIntegerDigits = end > start;
    let hasFractionDigits = false;
    if (source.charAt(end) === '.') {
      const fractionEnd = readDigits(end + 1);
      hasFractionDigits = fractionEnd > end + 1;
      if (hasIntegerDigits || hasFractionDigits) {
        end = fractionEnd;
      }
    }
    if (!hasIntegerDigits && !hasFractionDigits) {
      return false;
    }
    const e = source.charAt(end);
    if (e === 'e' || e === 'E') {
      let exponentEnd = end + 1;
      if (
        source.charAt(exponentEnd) === '+' ||
        source.charAt(exponentEnd) === '-'
      ) {
        exponentEnd++;
      }
      const digitsEnd = readDigits(exponentEnd);
      if (digitsEnd > exponentEnd) {
        end = digitsEnd;
      }
    }
    const raw = source.slice(start, end);
    tokens.push({
      type: 'number',
      value: parseFloat(raw.replaceAll('_', '')),
      raw,
      start,
      end,
    });
    pos = end;
    return true;
  };

  const readIdentifier = (): boolean => {
    if (!isIdentifierStart(source.charAt(pos))) {
      return false;
    }
    const start = pos;
    while (pos < source.length && isIdentifierPart(source.charAt(pos))) {
      pos++;
    }
    const value = source.slice(start, pos);
    tokens.push({ type: 'identifier', value, raw: value, start, end: pos });
    return true;
  };

  const readPunctuator = (): boolean => {
    const alias = config.punctuatorAliases[source.charAt(pos)];
    if (alias !== undefined) {
      tokens.push({
        type: 'punctuator',
        value: alias,
        raw: source.charAt(pos),
        start: pos,
        end: pos + 1,
      });
      pos++;
      return true;
    }
    let match = punctuators.find((p) => source.startsWith(p, pos));
    // `a?.5:1` is a conditional, not optional chaining.
    if (match === '?.' && isDigit(source.charAt(pos + 2))) {
      match = '?';
    }
    if (match === undefined) {
      return false;
    }
    if (config.templates) {
      if (match === '{') {
        braces.push('brace');
      } else if (match === '}' && braces.pop() === 'template') {
        const start = pos;
        pos++;
        readTemplate(start, false);
        return true;
      }
    }
    tokens.push({
      type: 'punctuator',
      value: match,
      raw: match,
      start: pos,
      end: pos + match.length,
    });
    pos += match.length;
    return true;
  };

  for (;;) {
    skipTrivia();
    if (pos >= source.length) {
      break;
    }
    const c = source.charAt(pos);
    if (config.quotes.includes(c)) {
      readString(c);
    } else if (config.templates && c === '`') {
      const start = pos;
      pos++;
      readTemplate(start, true);
    } else if (!(
      readRadixInteger() ||
      readNumber() ||
      readIdentifier() ||
      readPunctuator()
    )) {
      fail(`Unknown character "${c}"`);
    }
  }

  tokens.push({
    type: 'eof',
    value: '',
    raw: '',
    start: source.length,
    end: source.length,
  });
  return tokens;
};
