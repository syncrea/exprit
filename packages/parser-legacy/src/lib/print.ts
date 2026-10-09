import type { ElementNode, ExpressionNode } from '@exprit/core';

const escapeValue = (value: unknown): string =>
  typeof value === 'string'
    ? JSON.stringify(value)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
    : String(value);

const printLiteral = (value: unknown): string => {
  if (typeof value === 'number' && value < 0) {
    return `(${value})`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(escapeValue).join(', ')}]`;
  }
  return escapeValue(value);
};

const printElement = (element: ElementNode): string =>
  element.type === 'Spread'
    ? `...${printLegacy(element.argument)}`
    : printLegacy(element);

/**
 * Prints an AST the way expr-eval's `Expression#toString()` does: every
 * operation is fully parenthesised and lazily evaluated operands (the right side
 * of `and`/`or`, conditional branches, assigned values) get an extra pair.
 */
export const printLegacy = (node: ExpressionNode): string => {
  switch (node.type) {
    case 'Literal':
      return printLiteral(node.value);
    case 'Identifier':
      return node.name;
    case 'Unary': {
      const argument = printLegacy(node.argument);
      if (node.operator === '-' || node.operator === '+') {
        return `(${node.operator}${argument})`;
      }
      if (node.operator === '!') {
        return `(${argument}!)`;
      }
      return `(${node.operator} ${argument})`;
    }
    case 'Binary': {
      const left = printLegacy(node.left);
      const right = printLegacy(node.right);
      return node.operator === '['
        ? `${left}[${right}]`
        : `(${left} ${node.operator} ${right})`;
    }
    case 'Logical':
      return `(${printLegacy(node.left)} ${node.operator} (${printLegacy(node.right)}))`;
    case 'Conditional':
      return `(${printLegacy(node.test)} ? (${printLegacy(node.consequent)}) : (${printLegacy(node.alternate)}))`;
    case 'Member':
      return `${printLegacy(node.object)}${node.optional ? '?.' : '.'}${node.property}`;
    case 'Index':
      return `${printLegacy(node.object)}${node.optional ? '?.' : ''}[${printLegacy(node.index)}]`;
    case 'Call':
      return `${printLegacy(node.callee)}${node.optional ? '?.' : ''}(${node.arguments.map(printElement).join(', ')})`;
    case 'Chain':
      return printLegacy(node.expression);
    case 'Array':
      return `[${node.elements.map(printElement).join(', ')}]`;
    case 'Object':
      return `{${node.properties
        .map((p) =>
          p.type === 'Spread'
            ? `...${printLegacy(p.argument)}`
            : `${p.computed ? `[${printLegacy(p.key)}]` : printLegacy(p.key)}: ${printLegacy(p.value)}`,
        )
        .join(', ')}}`;
    case 'Arrow':
      return `((${node.params.join(', ')}) => ${printLegacy(node.body)})`;
    case 'Template':
      return `\`${node.quasis
        .map((q, i) =>
          i < node.expressions.length
            ? `${q}\${${printLegacy(node.expressions[i])}}`
            : q,
        )
        .join('')}\``;
    case 'Assignment':
      return `(${node.name} = (${printLegacy(node.value)}))`;
    case 'FunctionDefinition':
      return `(${node.name}(${node.params.join(', ')}) = (${printLegacy(node.body)}))`;
    case 'Sequence':
      return `(${node.expressions.map(printLegacy).join(';')})`;
  }
};
