export interface SourcePosition {
  readonly line: number;
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
 */
export class ExpressionSyntaxError extends Error {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
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

/** Thrown when evaluation hits a forbidden construct, such as prototype access. */
export class ExpressionSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionSecurityError';
  }
}
