/**
 * The shared abstract syntax tree. Both dialects parse into these nodes, so the
 * evaluator, transforms and registry never need to know which syntax produced them.
 *
 * Operator nodes carry the operator's registry key (for example `'+'` or `'and'`),
 * not a fixed semantic. Which function runs for that key is decided by the
 * registry passed to the evaluator.
 */

/** Source offsets of a node, as character indices into the parsed string. */
export interface SourceLocation {
  readonly start: number;
  readonly end: number;
}

interface BaseNode {
  readonly loc?: SourceLocation;
}

export interface LiteralNode extends BaseNode {
  readonly type: 'Literal';
  readonly value: unknown;
}

export interface IdentifierNode extends BaseNode {
  readonly type: 'Identifier';
  readonly name: string;
}

/** A prefix or postfix operator looked up in `registry.unaryOps`. */
export interface UnaryNode extends BaseNode {
  readonly type: 'Unary';
  readonly operator: string;
  readonly argument: ExpressionNode;
}

/** An eager binary operator looked up in `registry.binaryOps`. */
export interface BinaryNode extends BaseNode {
  readonly type: 'Binary';
  readonly operator: string;
  readonly left: ExpressionNode;
  readonly right: ExpressionNode;
}

/**
 * Short-circuiting operators. `and`/`or` coerce their result to a boolean
 * (expr-eval semantics); `&&`, `||` and `??` return an operand (JavaScript semantics).
 */
export type LogicalOperator = 'and' | 'or' | '&&' | '||' | '??';

export interface LogicalNode extends BaseNode {
  readonly type: 'Logical';
  readonly operator: LogicalOperator;
  readonly left: ExpressionNode;
  readonly right: ExpressionNode;
}

export interface ConditionalNode extends BaseNode {
  readonly type: 'Conditional';
  readonly test: ExpressionNode;
  readonly consequent: ExpressionNode;
  readonly alternate: ExpressionNode;
}

/** `object.property`, or `object?.property` when `optional` is set. */
export interface MemberNode extends BaseNode {
  readonly type: 'Member';
  readonly object: ExpressionNode;
  readonly property: string;
  readonly optional: boolean;
}

/** `object[index]`, or `object?.[index]` when `optional` is set. */
export interface IndexNode extends BaseNode {
  readonly type: 'Index';
  readonly object: ExpressionNode;
  readonly index: ExpressionNode;
  readonly optional: boolean;
}

export interface CallNode extends BaseNode {
  readonly type: 'Call';
  readonly callee: ExpressionNode;
  readonly arguments: readonly ElementNode[];
  readonly optional: boolean;
}

/** Wraps an optional chain so a nullish link short-circuits the whole chain to `undefined`. */
export interface ChainNode extends BaseNode {
  readonly type: 'Chain';
  readonly expression: ExpressionNode;
}

export interface SpreadNode extends BaseNode {
  readonly type: 'Spread';
  readonly argument: ExpressionNode;
}

export type ElementNode = ExpressionNode | SpreadNode;

export interface ArrayNode extends BaseNode {
  readonly type: 'Array';
  readonly elements: readonly ElementNode[];
}

export interface PropertyNode extends BaseNode {
  readonly type: 'Property';
  /** A string literal for `a:` / `'a':` keys, any expression for computed `[a]:` keys. */
  readonly key: ExpressionNode;
  readonly computed: boolean;
  readonly shorthand: boolean;
  readonly value: ExpressionNode;
}

export interface ObjectNode extends BaseNode {
  readonly type: 'Object';
  readonly properties: readonly (PropertyNode | SpreadNode)[];
}

export interface ArrowNode extends BaseNode {
  readonly type: 'Arrow';
  readonly params: readonly string[];
  readonly body: ExpressionNode;
}

/** A template literal: `quasis` always has one more entry than `expressions`. */
export interface TemplateNode extends BaseNode {
  readonly type: 'Template';
  readonly quasis: readonly string[];
  readonly expressions: readonly ExpressionNode[];
}

/** Legacy `name = value`: writes into the variables object passed to evaluate. */
export interface AssignmentNode extends BaseNode {
  readonly type: 'Assignment';
  readonly name: string;
  readonly value: ExpressionNode;
}

/** Legacy `name(a, b) = body`: defines a function in the variables object. */
export interface FunctionDefinitionNode extends BaseNode {
  readonly type: 'FunctionDefinition';
  readonly name: string;
  readonly params: readonly string[];
  readonly body: ExpressionNode;
}

/** Legacy `a; b`: evaluates each expression in order and yields the last. */
export interface SequenceNode extends BaseNode {
  readonly type: 'Sequence';
  readonly expressions: readonly ExpressionNode[];
}

export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | UnaryNode
  | BinaryNode
  | LogicalNode
  | ConditionalNode
  | MemberNode
  | IndexNode
  | CallNode
  | ChainNode
  | ArrayNode
  | ObjectNode
  | ArrowNode
  | TemplateNode
  | AssignmentNode
  | FunctionDefinitionNode
  | SequenceNode;

export type NodeType = ExpressionNode['type'];
