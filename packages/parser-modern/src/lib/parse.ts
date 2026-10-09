import {
  assertMaxDepth,
  DEFAULT_LIMITS,
  ExpressionSyntaxError,
  isBlockedName,
  type ElementNode,
  type ExpressionNode,
  type PropertyNode,
  type SpreadNode,
  type Token,
} from '@exprit/core';
import { MODERN_TOKENIZER_CONFIG, tokenize } from '@exprit/tokenizer';

/** Binding powers following JavaScript's operator precedence table. */
const BINARY_POWER: Readonly<Record<string, number>> = {
  '??': 30,
  '||': 30,
  '&&': 40,
  '|': 50,
  '^': 60,
  '&': 70,
  '===': 80,
  '!==': 80,
  '==': 80,
  '!=': 80,
  '<': 90,
  '>': 90,
  '<=': 90,
  '>=': 90,
  '<<': 100,
  '>>': 100,
  '>>>': 100,
  '+': 110,
  '-': 110,
  '*': 120,
  '/': 120,
  '%': 120,
  '**': 130,
};

const BP = {
  assignment: 5,
  conditional: 20,
  exponent: 130,
  prefix: 135,
  member: 150,
} as const;

const PREFIX_OPERATORS: ReadonlySet<string> = new Set(['-', '+', '!', '~']);
const MEMBER_OPERATORS: ReadonlySet<string> = new Set(['.', '?.', '[', '(']);

const KEYWORD_LITERALS: Readonly<Record<string, unknown>> = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
};

/** JavaScript keywords outside the expression subset, rejected with a clear message. */
const UNSUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  'new',
  'function',
  'class',
  'this',
  'super',
  'delete',
  'void',
  'await',
  'yield',
  'in',
  'instanceof',
  'let',
  'const',
  'var',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'throw',
  'try',
  'catch',
  'import',
  'export',
]);

/**
 * Options that let the modern dialect honour the same hardening switches as the
 * legacy dialect. When omitted, member access and every operator are allowed.
 */
export interface ModernGrammar {
  /** Whether `a.b`, `a?.b`, `a[i]` and method calls are allowed. */
  readonly allowMemberAccess: boolean;
  /** Whether a modern operator symbol (`+`, `**`, `&&`, `?`, `[`, ...) is enabled. */
  readonly isOperatorEnabled: (operator: string) => boolean;
  /** Longest source string accepted; defaults to the standard limit. */
  readonly maxSourceLength?: number;
  /** Deepest AST accepted; defaults to the standard limit. */
  readonly maxDepth?: number;
}

const DEFAULT_GRAMMAR: ModernGrammar = {
  allowMemberAccess: true,
  isOperatorEnabled: () => true,
};

/**
 * Parses an expression written in the modern dialect, the expression grammar of
 * JavaScript without assignment or side effects, into the shared AST.
 *
 * @param source - The expression text
 * @param grammar - Member-access and operator switches; everything is allowed by default
 * @returns The root AST node
 * @throws ExpressionSyntaxError when the expression is malformed or uses unsupported syntax
 */
export const parseModern = (
  source: string,
  grammar: ModernGrammar = DEFAULT_GRAMMAR,
): ExpressionNode => {
  const maxSourceLength =
    grammar.maxSourceLength ?? DEFAULT_LIMITS.maxSourceLength;
  const maxDepth = grammar.maxDepth ?? DEFAULT_LIMITS.maxDepth;
  if (source.length > maxSourceLength) {
    throw new ExpressionSyntaxError(
      `expression is too long (${source.length} > ${maxSourceLength})`,
      source,
      0,
    );
  }
  const tokens = tokenize(source, MODERN_TOKENIZER_CONFIG);
  const parenthesized = new WeakSet<ExpressionNode>();
  const inOptionalChain = new WeakSet<ExpressionNode>();
  let index = 0;

  const fail = (reason: string, at: number): never => {
    throw new ExpressionSyntaxError(reason, source, at);
  };

  /** Rejects an operator the environment switched off, by symbol. */
  const requireOperator = (operator: string, at: number): void => {
    if (!grammar.isOperatorEnabled(operator)) {
      fail(`operator "${operator}" is disabled`, at);
    }
  };

  /** Rejects `.`, `?.`, indexing and method calls when member access is off. */
  const requireMemberAccess = (at: number): void => {
    if (!grammar.allowMemberAccess) {
      fail('member access is not permitted', at);
    }
  };

  const peek = (offset = 0): Token =>
    tokens[Math.min(index + offset, tokens.length - 1)];
  const advance = (): Token => tokens[index++];
  const isPunctuator = (token: Token, value: string): boolean =>
    token.type === 'punctuator' && token.value === value;
  const accept = (value: string): boolean => {
    if (isPunctuator(peek(), value)) {
      index++;
      return true;
    }
    return false;
  };
  const describe = (token: Token): string =>
    token.type === 'eof' ? 'end of expression' : `"${token.raw}"`;
  const expect = (value: string): Token => {
    const token = peek();
    if (!isPunctuator(token, value)) {
      fail(`Expected "${value}" but found ${describe(token)}`, token.start);
    }
    return advance();
  };

  const leftBindingPower = (token: Token): number => {
    if (token.type !== 'punctuator') {
      return 0;
    }
    if (MEMBER_OPERATORS.has(token.value)) return BP.member;
    if (token.value === '?') return BP.conditional;
    if (token.value === '=') return BP.assignment;
    return BINARY_POWER[token.value] ?? 0;
  };

  const assertBindable = (name: string, at: number): void => {
    if (
      isBlockedName(name) ||
      Object.hasOwn(KEYWORD_LITERALS, name) ||
      UNSUPPORTED_KEYWORDS.has(name)
    ) {
      fail(`"${name}" cannot be used as a parameter name`, at);
    }
  };

  /** Looks ahead from just after `(` for `) =>` or `a, b) =>`. */
  const isArrowParameterList = (): boolean => {
    let offset = 0;
    if (isPunctuator(peek(), ')')) {
      return isPunctuator(peek(1), '=>');
    }
    for (;;) {
      if (peek(offset).type !== 'identifier') {
        return false;
      }
      offset++;
      if (isPunctuator(peek(offset), ',')) {
        offset++;
        if (isPunctuator(peek(offset), ')')) {
          return isPunctuator(peek(offset + 1), '=>');
        }
        continue;
      }
      return (
        isPunctuator(peek(offset), ')') && isPunctuator(peek(offset + 1), '=>')
      );
    }
  };

  const parseArrow = (params: readonly Token[]): ExpressionNode => {
    const names: string[] = [];
    for (const param of params) {
      assertBindable(param.value as string, param.start);
      if (names.includes(param.value as string)) {
        fail(`Duplicate parameter name "${param.value}"`, param.start);
      }
      names.push(param.value as string);
    }
    expect('=>');
    if (isPunctuator(peek(), '{')) {
      fail(
        'Arrow functions need an expression body; wrap object literals in parentheses',
        peek().start,
      );
    }
    return { type: 'Arrow', params: names, body: parse(BP.assignment - 1) };
  };

  const parseElements = (close: string): ElementNode[] => {
    const elements: ElementNode[] = [];
    while (!accept(close)) {
      if (isPunctuator(peek(), ',')) {
        fail('Array holes are not supported', peek().start);
      }
      elements.push(
        accept('...')
          ? { type: 'Spread', argument: parse(BP.assignment) }
          : parse(BP.assignment),
      );
      if (!accept(',')) {
        expect(close);
        break;
      }
    }
    return elements;
  };

  const parseObject = (): ExpressionNode => {
    const properties: (PropertyNode | SpreadNode)[] = [];
    while (!accept('}')) {
      const token = peek();
      if (accept('...')) {
        properties.push({ type: 'Spread', argument: parse(BP.assignment) });
      } else if (accept('[')) {
        const key = parse(0);
        expect(']');
        expect(':');
        properties.push({
          type: 'Property',
          key,
          computed: true,
          shorthand: false,
          value: parse(BP.assignment),
        });
      } else if (
        token.type === 'identifier' ||
        token.type === 'string' ||
        token.type === 'number'
      ) {
        advance();
        const name = String(token.value);
        const key: ExpressionNode = { type: 'Literal', value: name };
        if (
          token.type === 'identifier' &&
          (isPunctuator(peek(), ',') || isPunctuator(peek(), '}'))
        ) {
          properties.push({
            type: 'Property',
            key,
            computed: false,
            shorthand: true,
            value: { type: 'Identifier', name },
          });
        } else {
          expect(':');
          properties.push({
            type: 'Property',
            key,
            computed: false,
            shorthand: false,
            value: parse(BP.assignment),
          });
        }
      } else {
        fail(`Unexpected ${describe(token)} in object literal`, token.start);
      }
      if (!accept(',')) {
        expect('}');
        break;
      }
    }
    return { type: 'Object', properties };
  };

  const parseTemplate = (
    head: Token & { type: 'template' },
  ): ExpressionNode => {
    const quasis: string[] = [head.value];
    const expressions: ExpressionNode[] = [];
    for (;;) {
      expressions.push(parse(0));
      const next = advance();
      if (
        next.type !== 'template' ||
        (next.part !== 'middle' && next.part !== 'tail')
      ) {
        return fail('Unterminated template literal', next.start);
      }
      quasis.push(next.value);
      if (next.part === 'tail') {
        return { type: 'Template', quasis, expressions };
      }
    }
  };

  const nud = (token: Token): ExpressionNode => {
    switch (token.type) {
      case 'number':
      case 'string':
        return { type: 'Literal', value: token.value };
      case 'template':
        return token.part === 'full'
          ? { type: 'Template', quasis: [token.value], expressions: [] }
          : parseTemplate(token);
      case 'eof':
        return fail('Unexpected end of expression', token.start);
      case 'identifier': {
        const name = token.value;
        if (Object.hasOwn(KEYWORD_LITERALS, name)) {
          return { type: 'Literal', value: KEYWORD_LITERALS[name] };
        }
        if (name === 'typeof') {
          return {
            type: 'Unary',
            operator: 'typeof',
            argument: parse(BP.prefix),
          };
        }
        if (UNSUPPORTED_KEYWORDS.has(name)) {
          return fail(`"${name}" is not supported in expressions`, token.start);
        }
        if (isPunctuator(peek(), '=>')) {
          return parseArrow([token]);
        }
        return { type: 'Identifier', name };
      }
      case 'punctuator':
        break;
    }

    const op = token.value;
    if (op === '(') {
      if (isArrowParameterList()) {
        const params: Token[] = [];
        while (!accept(')')) {
          params.push(advance());
          accept(',');
        }
        return parseArrow(params);
      }
      const inner = parse(0);
      expect(')');
      parenthesized.add(inner);
      return inner;
    }
    if (op === '[') {
      requireOperator('[', token.start);
      return { type: 'Array', elements: parseElements(']') };
    }
    if (op === '{') {
      return parseObject();
    }
    if (PREFIX_OPERATORS.has(op)) {
      requireOperator(op, token.start);
      return { type: 'Unary', operator: op, argument: parse(BP.prefix) };
    }
    return fail(`Unexpected ${describe(token)}`, token.start);
  };

  const isBareLogical = (
    node: ExpressionNode,
    operators: readonly string[],
  ): boolean =>
    node.type === 'Logical' &&
    operators.includes(node.operator) &&
    !parenthesized.has(node);

  /** Wraps a finished optional chain so a nullish link short-circuits all of it. */
  const finishChain = (node: ExpressionNode): ExpressionNode => {
    const continuesChain =
      peek().type === 'punctuator' &&
      MEMBER_OPERATORS.has(peek().value as string);
    return inOptionalChain.has(node) && !continuesChain
      ? { type: 'Chain', expression: node }
      : node;
  };

  const markChain = (
    node: ExpressionNode,
    parent: ExpressionNode,
    optional: boolean,
  ): ExpressionNode => {
    if (optional || inOptionalChain.has(parent)) {
      inOptionalChain.add(node);
    }
    return finishChain(node);
  };

  const parseMember = (
    left: ExpressionNode,
    optional: boolean,
    at: number,
  ): ExpressionNode => {
    requireMemberAccess(at);
    if (accept('(')) {
      return markChain(
        { type: 'Call', callee: left, arguments: parseElements(')'), optional },
        left,
        optional,
      );
    }
    if (accept('[')) {
      const indexExpression = parse(0);
      expect(']');
      return markChain(
        { type: 'Index', object: left, index: indexExpression, optional },
        left,
        optional,
      );
    }
    const name = advance();
    if (name.type !== 'identifier') {
      return fail(
        'Expected a property name',
        name.type === 'eof' ? at : name.start,
      );
    }
    return markChain(
      { type: 'Member', object: left, property: name.value, optional },
      left,
      optional,
    );
  };

  const led = (token: Token, left: ExpressionNode): ExpressionNode => {
    const op = token.value as string;
    switch (op) {
      case '.': {
        requireMemberAccess(token.start);
        const name = advance();
        if (name.type !== 'identifier') {
          return fail('Expected a property name', name.start);
        }
        return markChain(
          {
            type: 'Member',
            object: left,
            property: name.value,
            optional: false,
          },
          left,
          false,
        );
      }
      case '?.':
        return parseMember(left, true, token.start);
      case '[': {
        requireMemberAccess(token.start);
        requireOperator('[', token.start);
        const indexExpression = parse(0);
        expect(']');
        return markChain(
          {
            type: 'Index',
            object: left,
            index: indexExpression,
            optional: false,
          },
          left,
          false,
        );
      }
      case '(':
        return markChain(
          {
            type: 'Call',
            callee: left,
            arguments: parseElements(')'),
            optional: false,
          },
          left,
          false,
        );
      case '?': {
        requireOperator('?', token.start);
        const consequent = parse(BP.assignment);
        expect(':');
        return {
          type: 'Conditional',
          test: left,
          consequent,
          alternate: parse(BP.conditional - 1),
        };
      }
      case '=':
        return fail('Assignment is not supported in expressions', token.start);
      case '==':
      case '!=':
        return fail(
          `Use "${op}=" instead of "${op}": loose equality is not supported`,
          token.start,
        );
      case '??': {
        requireOperator('??', token.start);
        const right = parse(BINARY_POWER['??']);
        if (
          isBareLogical(left, ['||', '&&']) ||
          isBareLogical(right, ['||', '&&'])
        ) {
          fail(
            'Cannot mix "??" with "||" or "&&" without parentheses',
            token.start,
          );
        }
        return { type: 'Logical', operator: '??', left, right };
      }
      case '||':
      case '&&': {
        requireOperator(op, token.start);
        const right = parse(BINARY_POWER[op]);
        if (isBareLogical(left, ['??']) || isBareLogical(right, ['??'])) {
          fail(`Cannot mix "${op}" with "??" without parentheses`, token.start);
        }
        return { type: 'Logical', operator: op, left, right };
      }
      case '**':
        requireOperator('**', token.start);
        if (left.type === 'Unary' && !parenthesized.has(left)) {
          fail(
            'Parenthesize the unary operand of "**", e.g. (-a) ** b',
            token.start,
          );
        }
        return {
          type: 'Binary',
          operator: op,
          left,
          right: parse(BP.exponent - 1),
        };
    }
    requireOperator(op, token.start);
    return {
      type: 'Binary',
      operator: op,
      left,
      right: parse(BINARY_POWER[op]),
    };
  };

  let parseDepth = 0;
  function parse(rightBindingPower: number): ExpressionNode {
    if (++parseDepth > maxDepth) {
      fail('expression is nested too deeply', peek().start);
    }
    let left = nud(advance());
    while (rightBindingPower < leftBindingPower(peek())) {
      left = led(advance(), left);
    }
    parseDepth--;
    return left;
  }

  const root = parse(0);
  const rest = peek();
  if (rest.type !== 'eof') {
    if (isPunctuator(rest, ';')) {
      fail(
        'Statements are not supported; write a single expression',
        rest.start,
      );
    }
    fail(`Unexpected ${describe(rest)}`, rest.start);
  }
  assertMaxDepth(root, maxDepth, () =>
    fail('expression is nested too deeply', 0),
  );
  return root;
};
