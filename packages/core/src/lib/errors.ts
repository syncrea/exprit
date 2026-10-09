/** A 1-based line and column in an expression's source text. */
export interface SourcePosition {
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column number. */
  readonly column: number;
}

/**
 * Converts a character offset into a 1-based line and column, the same way
 * expr-eval reports parse error coordinates.
 */
export const positionAt = (source: string, offset: number): SourcePosition => {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charAt(i) === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
};

/**
 * Thrown for any tokenizer or parser failure. The message keeps expr-eval's
 * `parse error [line:column]: ...` shape so callers matching on it keep working.
 *
 * @example
 * ```typescript
 * try {
 *   parse('2 +');
 * } catch (error) {
 *   if (error instanceof ExpressionSyntaxError) {
 *     error.message; // 'parse error [1:4]: Unexpected end of expression'
 *     error.reason; // 'Unexpected end of expression'
 *     error.column; // 4
 *   }
 * }
 * ```
 *
 * @group Errors
 */
export class ExpressionSyntaxError extends Error {
  /** 1-based line of the problem. */
  readonly line: number;
  /** 1-based column of the problem. */
  readonly column: number;
  /** 0-based character offset of the problem in the source text. */
  readonly offset: number;
  /** The message without the `parse error [line:column]:` prefix. */
  readonly reason: string;

  constructor(reason: string, source: string, offset: number) {
    const { line, column } = positionAt(source, offset);
    super(`parse error [${line}:${column}]: ${reason}`);
    this.name = 'ExpressionSyntaxError';
    this.line = line;
    this.column = column;
    this.offset = offset;
    this.reason = reason;
  }
}

/**
 * Thrown when an expression reaches for a forbidden name, such as
 * `constructor`, `__proto__` or `prototype`.
 *
 * @group Errors
 */
export class ExpressionSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionSecurityError';
  }
}
