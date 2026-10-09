import {
  ExpressionSyntaxError,
  isBlockedName,
  type ExpressionNode,
  type Token,
} from '@exprit/core';
import { LEGACY_TOKENIZER_CONFIG, tokenize } from '@exprit/tokenizer';

/**
 * What the legacy grammar needs to know about the parser's operator tables.
 * expr-eval decides at parse time whether a word is an operator or a constant,
 * so these tables shape the syntax, not only the evaluation.
 */
export interface LegacyGrammar {
  readonly unaryOps: Readonly<Record<string, unknown>>;
  readonly binaryOps: Readonly<Record<string, unknown>>;
  readonly ternaryOps: Readonly<Record<string, unknown>>;
  readonly consts: Readonly<Record<string, unknown>>;
  readonly isOperatorEnabled: (operator: string) => boolean;
  readonly allowMemberAccess: boolean;
}

/** Punctuators that can be switched off through the `operators` option. */
const TOGGLEABLE_PUNCTUATORS: ReadonlySet<string> = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '?',
  ':',
  '||',
  '==',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  '=',
  '!',
  '[',
]);

const COMPARISON_OPERATORS: ReadonlySet<string> = new Set([
  '==',
  '!=',
  '<',
  '<=',
  '>=',
  '>',
  'in',
]);
const ADDITIVE_OPERATORS: ReadonlySet<string> = new Set(['+', '-', '||']);
const MULTIPLICATIVE_OPERATORS: ReadonlySet<string> = new Set(['*', '/', '%']);

/** Binding powers, lowest first. A Pratt parser turns precedence into data. */
const BP = {
  assignment: 10,
  conditional: 20,
  or: 30,
  and: 40,
  comparison: 50,
  additive: 60,
  multiplicative: 70,
  prefix: 80,
  exponent: 90,
  postfix: 100,
  member: 110,
} as const;

/** Tokens after which a prefix operator name stands alone as a function value. */
const VALUE_TERMINATORS: ReadonlySet<string> = new Set([
  ',',
  ';',
  ')',
  ']',
  '',
]);

/**
 * A word is a legal expr-eval variable name when it starts with a letter or
 * `_` (optionally after one `$`) and continues with letters, digits or `_`.
 */
const isLegacyName = (word: string): boolean => {
  const isLetter = (c: string): boolean => c.toUpperCase() !== c.toLowerCase();
  const body = word.startsWith('$') ? word.slice(1) : word;
  if (body === '') {
    return false;
  }
  const first = body.charAt(0);
  if (!(isLetter(first) || (first === '_' && !word.startsWith('$')))) {
    return false;
  }
  return [...body.slice(1)].every(
    (c) => isLetter(c) || c === '_' || (c >= '0' && c <= '9'),
  );
};

type LexSymbol =
  | { readonly kind: 'operator'; readonly value: string; readonly token: Token }
  | { readonly kind: 'const'; readonly value: unknown; readonly token: Token }
  | { readonly kind: 'name'; readonly value: string; readonly token: Token }
  | { readonly kind: 'literal'; readonly value: unknown; readonly token: Token }
  | { readonly kind: 'eof'; readonly value: ''; readonly token: Token };

/**
 * Parses an expression written in expr-eval's syntax into the shared AST.
 *
 * @param source - The expression text
 * @param grammar - Operator tables and options that shape the syntax
 * @returns The root AST node
 * @throws ExpressionSyntaxError when the expression is malformed
 */
export const parseLegacy = (
  source: string,
  grammar: LegacyGrammar,
): ExpressionNode => {
  const fail = (reason: string, at: number): never => {
    throw new ExpressionSyntaxError(reason, source, at);
  };

  const isOperatorWord = (word: string): boolean =>
    grammar.isOperatorEnabled(word) &&
    (Object.hasOwn(grammar.binaryOps, word) ||
      Object.hasOwn(grammar.unaryOps, word) ||
      Object.hasOwn(grammar.ternaryOps, word));

  const classify = (token: Token): LexSymbol => {
    switch (token.type) {
      case 'number':
      case 'string':
        return { kind: 'literal', value: token.value, token };
      case 'eof':
        return { kind: 'eof', value: '', token };
      case 'punctuator':
        if (
          TOGGLEABLE_PUNCTUATORS.has(token.value) &&
          !grammar.isOperatorEnabled(token.value)
        ) {
          return fail(
            `Unknown character "${token.raw.charAt(0)}"`,
            token.start,
          );
        }
        if (token.value === ']' && !grammar.isOperatorEnabled('[')) {
          return fail('Unknown character "]"', token.start);
        }
        return { kind: 'operator', value: token.value, token };
      case 'identifier':
        if (isOperatorWord(token.value)) {
          return { kind: 'operator', value: token.value, token };
        }
        if (Object.hasOwn(grammar.consts, token.value)) {
          return { kind: 'const', value: grammar.consts[token.value], token };
        }
        if (!isLegacyName(token.value)) {
          return fail(`Invalid name "${token.value}"`, token.start);
        }
        return { kind: 'name', value: token.value, token };
      case 'template':
        return fail('Unknown character "`"', token.start);
    }
  };

  const symbols = tokenize(source, LEGACY_TOKENIZER_CONFIG).map(classify);
  let index = 0;

  const peek = (): LexSymbol => symbols[index];
  const advance = (): LexSymbol => symbols[index++];
  const isOperator = (symbol: LexSymbol, value: string): boolean =>
    symbol.kind === 'operator' && symbol.value === value;
  const accept = (value: string): boolean => {
    if (isOperator(peek(), value)) {
      index++;
      return true;
    }
    return false;
  };
  const expect = (value: string): void => {
    if (!accept(value)) {
      fail(`Expected ${value}`, peek().token.start);
    }
  };
  const isPrefixOperator = (symbol: LexSymbol): boolean =>
    symbol.kind === 'operator' && Object.hasOwn(grammar.unaryOps, symbol.value);

  const leftBindingPower = (symbol: LexSymbol): number => {
    if (symbol.kind !== 'operator') {
      return 0;
    }
    const op = symbol.value;
    if (op === '=') return BP.assignment;
    if (op === '?') return BP.conditional;
    if (op === 'or') return BP.or;
    if (op === 'and') return BP.and;
    if (COMPARISON_OPERATORS.has(op)) return BP.comparison;
    if (ADDITIVE_OPERATORS.has(op)) return BP.additive;
    if (MULTIPLICATIVE_OPERATORS.has(op)) return BP.multiplicative;
    if (op === '^') return BP.exponent;
    if (op === '!' && Object.hasOwn(grammar.unaryOps, '!')) return BP.postfix;
    if (op === '.' || op === '[' || op === '(') return BP.member;
    return 0;
  };

  /** A full expression, including `;`-separated sequences. */
  const parseExpression = (): ExpressionNode => {
    const first = parse(0);
    if (!accept(';')) {
      return first;
    }
    const next = peek();
    if (next.kind === 'eof' || isOperator(next, ')')) {
      return { type: 'Sequence', expressions: [first] };
    }
    return { type: 'Sequence', expressions: [first, parseExpression()] };
  };

  const parseList = (close: string): ExpressionNode[] => {
    const items: ExpressionNode[] = [];
    if (accept(close)) {
      return items;
    }
    do {
      items.push(parseExpression());
    } while (accept(','));
    expect(close);
    return items;
  };

  const parsePrefix = (symbol: LexSymbol): ExpressionNode => {
    const op = symbol.value as string;
    if (op !== '-' && op !== '+') {
      const next = peek();
      if (isOperator(next, '(')) {
        // `sin(x)` binds the operator to the parenthesised atom only, so `sin(x)^2` is `(sin x)^2`.
        advance();
        const argument = parseExpression();
        expect(')');
        return { type: 'Unary', operator: op, argument };
      }
      if (
        next.kind === 'eof' ||
        (next.kind === 'operator' && VALUE_TERMINATORS.has(next.value))
      ) {
        return { type: 'Identifier', name: op };
      }
    }
    return { type: 'Unary', operator: op, argument: parse(BP.prefix) };
  };

  const nud = (symbol: LexSymbol): ExpressionNode => {
    switch (symbol.kind) {
      case 'literal':
      case 'const':
        return { type: 'Literal', value: symbol.value };
      case 'name':
        return { type: 'Identifier', name: symbol.value };
      case 'eof':
        return fail('Unexpected end of expression', symbol.token.start);
      case 'operator':
        if (symbol.value === '(') {
          const inner = parseExpression();
          expect(')');
          return inner;
        }
        if (symbol.value === '[') {
          return { type: 'Array', elements: parseList(']') };
        }
        if (isPrefixOperator(symbol)) {
          return parsePrefix(symbol);
        }
        return fail(`Unexpected "${symbol.token.raw}"`, symbol.token.start);
    }
  };

  const parseAssignment = (
    left: ExpressionNode,
    at: number,
  ): ExpressionNode => {
    if (left.type === 'Identifier') {
      return {
        type: 'Assignment',
        name: left.name,
        value: parse(BP.assignment - 1),
      };
    }
    if (
      left.type === 'Call' &&
      left.callee.type === 'Identifier' &&
      left.arguments.every((arg) => arg.type === 'Identifier')
    ) {
      if (!grammar.isOperatorEnabled('()=')) {
        return fail('function definition is not permitted', at);
      }
      const names = [
        left.callee.name,
        ...left.arguments.map((arg) =>
          arg.type === 'Identifier' ? arg.name : '',
        ),
      ];
      const blocked = names.find(isBlockedName);
      if (blocked !== undefined) {
        return fail(
          `"${blocked}" cannot be used as a function or parameter name`,
          at,
        );
      }
      return {
        type: 'FunctionDefinition',
        name: left.callee.name,
        params: left.arguments.map((arg) =>
          arg.type === 'Identifier' ? arg.name : '',
        ),
        body: parse(BP.assignment - 1),
      };
    }
    return fail('expected variable for assignment', at);
  };

  const led = (symbol: LexSymbol, left: ExpressionNode): ExpressionNode => {
    const op = symbol.value as string;
    const at = symbol.token.start;
    switch (op) {
      case '=':
        return parseAssignment(left, at);
      case '?': {
        const consequent = parse(BP.conditional - 1);
        expect(':');
        const alternate = parse(BP.conditional - 1);
        return { type: 'Conditional', test: left, consequent, alternate };
      }
      case 'or':
      case 'and':
        return {
          type: 'Logical',
          operator: op,
          left,
          right: parse(op === 'or' ? BP.or : BP.and),
        };
      case '^':
        // Right-associative: `2^3^2` is `2^(3^2)`.
        return {
          type: 'Binary',
          operator: op,
          left,
          right: parse(BP.exponent - 1),
        };
      case '!':
        return { type: 'Unary', operator: '!', argument: left };
      case '.': {
        if (!grammar.allowMemberAccess) {
          return fail('unexpected ".", member access is not permitted', at);
        }
        const name = advance();
        if (name.token.type !== 'identifier') {
          return fail('Expected TNAME', name.token.start);
        }
        return {
          type: 'Member',
          object: left,
          property: name.token.value,
          optional: false,
        };
      }
      case '[': {
        const indexExpression = parseExpression();
        expect(']');
        return { type: 'Binary', operator: '[', left, right: indexExpression };
      }
      case '(':
        return {
          type: 'Call',
          callee: left,
          arguments: parseList(')'),
          optional: false,
        };
    }
    const power = leftBindingPower(symbol);
    return { type: 'Binary', operator: op, left, right: parse(power) };
  };

  function parse(rightBindingPower: number): ExpressionNode {
    let left = nud(advance());
    while (rightBindingPower < leftBindingPower(peek())) {
      left = led(advance(), left);
    }
    return left;
  }

  const root = parseExpression();
  if (peek().kind !== 'eof') {
    fail('Expected EOF', peek().token.start);
  }
  return root;
};
