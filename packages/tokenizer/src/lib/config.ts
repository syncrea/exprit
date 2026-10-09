export type EscapeStyle = 'legacy' | 'javascript';

export type RadixPrefix = 'x' | 'o' | 'b';

/**
 * Lexical rules of a dialect. The scanner itself is shared; only this data
 * differs between expr-eval syntax and the JavaScript-flavoured syntax.
 */
export interface TokenizerConfig {
  /** Operator and delimiter spellings. Matched longest first. */
  readonly punctuators: readonly string[];
  /** Characters accepted as an alternative spelling of a punctuator, e.g. `•` for `*`. */
  readonly punctuatorAliases: Readonly<Record<string, string>>;
  readonly lineComments: boolean;
  /** An unterminated block comment silently runs to the end when false. */
  readonly strictBlockComments: boolean;
  readonly radixPrefixes: readonly RadixPrefix[];
  /** Allow `1_000` numeric separators. */
  readonly numericSeparators: boolean;
  readonly quotes: readonly string[];
  readonly escapes: EscapeStyle;
  /** Recognise backtick template literals with `${}` substitutions. */
  readonly templates: boolean;
}

/** expr-eval's lexical grammar. */
export const LEGACY_TOKENIZER_CONFIG: TokenizerConfig = {
  punctuators: [
    '||',
    '==',
    '!=',
    '>=',
    '<=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
    '?',
    ':',
    '.',
    '>',
    '<',
    '=',
    '!',
    '(',
    ')',
    '[',
    ']',
    ',',
    ';',
  ],
  punctuatorAliases: { '∙': '*', '•': '*' },
  lineComments: false,
  strictBlockComments: false,
  radixPrefixes: ['x', 'b'],
  numericSeparators: false,
  quotes: ["'", '"'],
  escapes: 'legacy',
  templates: false,
};

/** The expression subset of JavaScript's lexical grammar. */
export const MODERN_TOKENIZER_CONFIG: TokenizerConfig = {
  punctuators: [
    '>>>',
    '===',
    '!==',
    '...',
    '**',
    '&&',
    '||',
    '??',
    '?.',
    '==',
    '!=',
    '>=',
    '<=',
    '<<',
    '>>',
    '=>',
    '+',
    '-',
    '*',
    '/',
    '%',
    '?',
    ':',
    '.',
    '>',
    '<',
    '=',
    '!',
    '~',
    '&',
    '|',
    '^',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    ',',
    ';',
  ],
  punctuatorAliases: {},
  lineComments: true,
  strictBlockComments: true,
  radixPrefixes: ['x', 'o', 'b'],
  numericSeparators: true,
  quotes: ["'", '"'],
  escapes: 'javascript',
  templates: true,
};
