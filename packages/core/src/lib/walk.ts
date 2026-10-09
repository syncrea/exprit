import type { ElementNode, ExpressionNode } from './ast';

/** The direct child expression nodes of a node, for generic tree walks. */
export const childrenOf = (node: ExpressionNode): ExpressionNode[] => {
  const fromElements = (elements: readonly ElementNode[]): ExpressionNode[] =>
    elements.map((element) =>
      element.type === 'Spread' ? element.argument : element,
    );
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return [];
    case 'Unary':
      return [node.argument];
    case 'Binary':
    case 'Logical':
      return [node.left, node.right];
    case 'Conditional':
      return [node.test, node.consequent, node.alternate];
    case 'Member':
      return [node.object];
    case 'Index':
      return [node.object, node.index];
    case 'Call':
      return [node.callee, ...fromElements(node.arguments)];
    case 'Chain':
      return [node.expression];
    case 'Array':
      return fromElements(node.elements);
    case 'Object':
      return node.properties.flatMap((property) =>
        property.type === 'Spread'
          ? [property.argument]
          : [property.key, property.value],
      );
    case 'Arrow':
      return [node.body];
    case 'Template':
      return [...node.expressions];
    case 'Assignment':
      return [node.value];
    case 'FunctionDefinition':
      return [node.body];
    case 'Sequence':
      return [...node.expressions];
  }
};

/**
 * Throws `onExceeded(...)` if the tree is deeper than `maxDepth`. Walks with an
 * explicit stack, so it never overflows on the very trees it is meant to
 * reject. Bounding depth here keeps every recursive walk downstream
 * (evaluate, compile, print, simplify, freeze) safe for any tree the parser
 * accepts.
 */
export const assertMaxDepth = (
  root: ExpressionNode,
  maxDepth: number,
  onExceeded: () => never,
): void => {
  if (!Number.isFinite(maxDepth)) {
    return;
  }
  const stack: Array<{ node: ExpressionNode; depth: number }> = [
    { node: root, depth: 1 },
  ];
  while (stack.length > 0) {
    const { node, depth } = stack.pop() as {
      node: ExpressionNode;
      depth: number;
    };
    if (depth > maxDepth) {
      onExceeded();
    }
    for (const child of childrenOf(node)) {
      stack.push({ node: child, depth: depth + 1 });
    }
  }
};
