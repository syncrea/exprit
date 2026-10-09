import type { ElementNode, ExpressionNode } from '@exprit/core';

const printLiteral = (value: unknown): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && (value < 0 || Object.is(value, -0))) {
    return `(${Object.is(value, -0) ? '-0' : String(value)})`;
  }
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    return JSON.stringify(value);
  }
  return String(value);
};

const isIdentifierName = (name: string): boolean =>
  /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name);

const printElement = (element: ElementNode): string =>
  element.type === 'Spread'
    ? `...${printModern(element.argument)}`
    : printModern(element);

const escapeTemplate = (text: string): string =>
  text.replace(/[`\\]|\$\{/g, (match) => `\\${match}`);

/**
 * Prints an AST as modern-dialect source. Every operation is parenthesised,
 * so the output always parses back to the same tree.
 */
export const printModern = (node: ExpressionNode): string => {
  switch (node.type) {
    case 'Literal':
      return printLiteral(node.value);
    case 'Identifier':
      return node.name;
    case 'Unary':
      return node.operator === 'typeof'
        ? `(typeof ${printModern(node.argument)})`
        : `(${node.operator}${printModern(node.argument)})`;
    case 'Binary':
    case 'Logical':
      return `(${printModern(node.left)} ${node.operator} ${printModern(node.right)})`;
    case 'Conditional':
      return `(${printModern(node.test)} ? ${printModern(node.consequent)} : ${printModern(node.alternate)})`;
    case 'Member':
      return `${printModern(node.object)}${node.optional ? '?.' : '.'}${node.property}`;
    case 'Index':
      return `${printModern(node.object)}${node.optional ? '?.' : ''}[${printModern(node.index)}]`;
    case 'Call':
      return `${printModern(node.callee)}${node.optional ? '?.' : ''}(${node.arguments.map(printElement).join(', ')})`;
    case 'Chain':
      return printModern(node.expression);
    case 'Array':
      return `[${node.elements.map(printElement).join(', ')}]`;
    case 'Object':
      return `({ ${node.properties
        .map((p) => {
          if (p.type === 'Spread') {
            return `...${printModern(p.argument)}`;
          }
          if (p.computed) {
            return `[${printModern(p.key)}]: ${printModern(p.value)}`;
          }
          const key = String(
            p.key.type === 'Literal' ? p.key.value : printModern(p.key),
          );
          if (p.shorthand) {
            return key;
          }
          return `${isIdentifierName(key) ? key : JSON.stringify(key)}: ${printModern(p.value)}`;
        })
        .join(', ')} })`;
    case 'Arrow':
      return `((${node.params.join(', ')}) => ${printModern(node.body)})`;
    case 'Template':
      return `\`${node.quasis
        .map((q, i) =>
          i < node.expressions.length
            ? `${escapeTemplate(q)}\${${printModern(node.expressions[i])}}`
            : escapeTemplate(q),
        )
        .join('')}\``;
    case 'Assignment':
      return `(${node.name} = ${printModern(node.value)})`;
    case 'FunctionDefinition':
      return `(${node.name} = (${node.params.join(', ')}) => ${printModern(node.body)})`;
    case 'Sequence':
      return `(${node.expressions.map(printModern).join(', ')})`;
  }
};
