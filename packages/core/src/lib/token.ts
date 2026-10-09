/**
 * Tokens produced by the tokenizer. The tokenizer is dialect-agnostic: it only
 * splits the source into lexemes. Deciding whether an identifier is a keyword,
 * a named operator or a constant is the parser's job.
 */
export type TokenType =
  'number' | 'string' | 'identifier' | 'punctuator' | 'template' | 'eof';

/** Which slice of a template literal a template token covers. */
export type TemplatePart = 'full' | 'head' | 'middle' | 'tail';

interface BaseToken {
  /** Raw source text of the token. */
  readonly raw: string;
  readonly start: number;
  readonly end: number;
}

export interface NumberToken extends BaseToken {
  readonly type: 'number';
  readonly value: number;
}

export interface StringToken extends BaseToken {
  readonly type: 'string';
  /** The string with escapes resolved. */
  readonly value: string;
}

export interface IdentifierToken extends BaseToken {
  readonly type: 'identifier';
  readonly value: string;
}

export interface PunctuatorToken extends BaseToken {
  readonly type: 'punctuator';
  readonly value: string;
}

export interface TemplateToken extends BaseToken {
  readonly type: 'template';
  readonly part: TemplatePart;
  /** The cooked text between the template delimiters. */
  readonly value: string;
}

export interface EofToken extends BaseToken {
  readonly type: 'eof';
  readonly value: '';
}

export type Token =
  | NumberToken
  | StringToken
  | IdentifierToken
  | PunctuatorToken
  | TemplateToken
  | EofToken;
