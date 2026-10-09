/**
 * Read-only views of what the real engine produced: the AST as an indented
 * tree, the token stream, and highlight spans for the editor. Tokens come from
 * exprit's own tokenizer (`@syncrea/exprit/core`), so highlighting matches
 * exactly what the parser sees.
 */
import {
  ExpressionSyntaxError,
  type Dialect,
  type ExpressionNode,
} from '@syncrea/exprit';
import {
  LEGACY_TOKENIZER_CONFIG,
  MODERN_TOKENIZER_CONFIG,
  tokenize,
  type Token,
  type TokenizerConfig,
} from '@syncrea/exprit/core';

import { environmentFor } from './engine';

type NodeRecord = Readonly<Record<string, unknown>> & { readonly type: string };

const isNode = (value: unknown): value is NodeRecord =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { readonly type?: unknown }).type === 'string';

const asRecord = (node: ExpressionNode): NodeRecord =>
  node as unknown as NodeRecord;

const formatLiteral = (value: unknown): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'function') {
    return 'ƒ';
  }
  const json = JSON.stringify(value) ?? '';
  return json.length > 40 ? `${json.slice(0, 37)}...` : json;
};

const stringList = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join(', ') : '';

const detailOf = (node: NodeRecord): string => {
  switch (node.type) {
    case 'Literal':
      return formatLiteral(node['value']);
    case 'Identifier':
      return String(node['name']);
    case 'Unary':
    case 'Binary':
    case 'Logical':
      return String(node['operator']);
    case 'Member':
      return `${node['optional'] ? '?.' : '.'}${String(node['property'])}`;
    case 'Index':
    case 'Call':
      return node['optional'] ? '?.' : '';
    case 'Arrow':
      return `(${stringList(node['params'])}) =>`;
    case 'Template':
      return `${Array.isArray(node['expressions']) ? node['expressions'].length : 0} slots`;
    case 'Assignment':
      return `${String(node['name'])} =`;
    case 'FunctionDefinition':
      return `${String(node['name'])}(${stringList(node['params'])}) =`;
    case 'Property':
      return node['computed'] ? '[computed]' : '';
    default:
      return '';
  }
};

export interface AstLine {
  readonly depth: number;
  /** The field of the parent this node sits in, e.g. `left` or `arguments[0]`. */
  readonly label: string;
  readonly kind: string;
  readonly detail: string;
}

const childrenOf = (
  node: NodeRecord,
): readonly (readonly [string, NodeRecord])[] =>
  Object.entries(node).flatMap(([key, value]): [string, NodeRecord][] => {
    if (key === 'type' || key === 'loc') {
      return [];
    }
    if (node.type === 'Literal' && key === 'value') {
      return [];
    }
    if (isNode(value)) {
      return [[key, value]];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item, index): [string, NodeRecord][] =>
        isNode(item) ? [[`${key}[${index}]`, item]] : [],
      );
    }
    return [];
  });

/** The AST as indented lines, parent before children. */
export const flattenAst = (root: ExpressionNode): readonly AstLine[] => {
  const visit = (
    node: NodeRecord,
    depth: number,
    label: string,
  ): readonly AstLine[] => [
    { depth, label, kind: node.type, detail: detailOf(node) },
    ...childrenOf(node).flatMap(([childLabel, child]) =>
      visit(child, depth + 1, childLabel),
    ),
  ];
  return visit(asRecord(root), 0, '');
};

export type TokenClass =
  'kw' | 'str' | 'num' | 'fn' | 'op' | 'punct' | 'cm' | 'ident' | 'err';

export interface HighlightSpan {
  readonly from: number;
  readonly to: number;
  readonly cls: TokenClass;
}

export interface TokenChip {
  readonly text: string;
  readonly cls: TokenClass;
}

export interface Highlighting {
  readonly spans: readonly HighlightSpan[];
  /** Every token the tokenizer produced (without the end-of-input marker). */
  readonly chips: readonly TokenChip[];
}

const KEYWORDS: Readonly<Record<Dialect, ReadonlySet<string>>> = {
  legacy: new Set(['and', 'or', 'not', 'in']),
  modern: new Set(['typeof']),
};

const LITERAL_WORDS: Readonly<Record<Dialect, ReadonlySet<string>>> = {
  legacy: new Set(['true', 'false']),
  modern: new Set(['true', 'false', 'null', 'undefined']),
};

const PUNCTUATION: ReadonlySet<string> = new Set([
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  ';',
  '.',
]);

const tokenConfig = (dialect: Dialect): TokenizerConfig =>
  dialect === 'modern' ? MODERN_TOKENIZER_CONFIG : LEGACY_TOKENIZER_CONFIG;

/** Tokenizes as far as the source is valid; returns where it stopped, if early. */
const tokenizeLeniently = (
  source: string,
  dialect: Dialect,
): { readonly tokens: readonly Token[]; readonly errorAt?: number } => {
  try {
    return { tokens: tokenize(source, tokenConfig(dialect)) };
  } catch (error) {
    if (!(error instanceof ExpressionSyntaxError)) {
      throw error;
    }
    try {
      return {
        tokens: tokenize(source.slice(0, error.offset), tokenConfig(dialect)),
        errorAt: error.offset,
      };
    } catch {
      return { tokens: [], errorAt: 0 };
    }
  }
};

const classify = (
  tokens: readonly Token[],
  index: number,
  dialect: Dialect,
): TokenClass => {
  const token = tokens[index];
  switch (token.type) {
    case 'number':
      return 'num';
    case 'string':
    case 'template':
      return 'str';
    case 'punctuator':
      return PUNCTUATION.has(token.value) ? 'punct' : 'op';
    case 'identifier': {
      const previous = tokens[index - 1];
      if (
        previous?.type === 'punctuator' &&
        (previous.value === '.' || previous.value === '?.')
      ) {
        return 'ident';
      }
      if (LITERAL_WORDS[dialect].has(token.value)) {
        return 'num';
      }
      if (KEYWORDS[dialect].has(token.value)) {
        return 'kw';
      }
      const next = tokens[index + 1];
      const isCall = next?.type === 'punctuator' && next.value === '(';
      const isNamedOperator =
        dialect === 'legacy' &&
        Object.hasOwn(environmentFor('legacy').unaryOps, token.value);
      return isCall || isNamedOperator ? 'fn' : 'ident';
    }
    default:
      return 'ident';
  }
};

/** Highlight spans for the editor, plus the token list for the inspector. */
export const highlight = (source: string, dialect: Dialect): Highlighting => {
  const { tokens, errorAt } = tokenizeLeniently(source, dialect);
  const real = tokens.filter((token) => token.type !== 'eof');
  const spans: HighlightSpan[] = [];
  const chips: TokenChip[] = [];
  let cursor = 0;
  real.forEach((token, index) => {
    // The tokenizer skips comments; any non-blank gap between tokens is one.
    if (source.slice(cursor, token.start).trim() !== '') {
      spans.push({ from: cursor, to: token.start, cls: 'cm' });
    }
    const cls = classify(real, index, dialect);
    spans.push({ from: token.start, to: token.end, cls });
    chips.push({ text: token.raw, cls });
    cursor = token.end;
  });
  const end = errorAt ?? source.length;
  if (source.slice(cursor, end).trim() !== '') {
    spans.push({ from: cursor, to: end, cls: 'cm' });
  }
  if (errorAt !== undefined && errorAt < source.length) {
    spans.push({ from: errorAt, to: source.length, cls: 'err' });
  }
  return { spans, chips };
};
