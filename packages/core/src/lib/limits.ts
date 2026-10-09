/**
 * Resource limits that keep an untrusted expression from exhausting memory or
 * CPU. They are on by default in every API, with generous defaults that no
 * real expression (and no expr-eval conformance test) reaches. Set a field to
 * `Infinity` to disable that one limit.
 *
 * These limits cannot cap the memory or wall-clock time of the host process
 * the way an operating system can; run untrusted evaluation in a worker or a
 * separate process with a hard memory cap and a kill timer as well. They do
 * turn the sharpest denial-of-service vectors (an uncatchable out-of-memory
 * crash, a parse-time stack overflow) into a catchable error.
 *
 * @group Limits
 */
export interface Limits {
  /** Longest string an expression may produce (`repeat`, `padStart`, `+`, ...). */
  readonly maxStringLength: number;
  /** Longest array an expression may produce (`concat`, spreads, `split`, ...). */
  readonly maxArrayLength: number;
  /** Most own keys an object literal an expression builds may have. */
  readonly maxObjectKeys: number;
  /** Deepest AST the parser accepts, which also bounds every recursive walk. */
  readonly maxDepth: number;
  /** Longest source string the parser accepts. */
  readonly maxSourceLength: number;
  /** Most evaluation steps (node visits) a single evaluation may take. */
  readonly maxSteps: number;
}

/**
 * The default limits, on in every API. Generous enough that ordinary
 * expressions are unaffected, tight enough to stop the sharpest DoS vectors.
 *
 * @group Limits
 */
export const DEFAULT_LIMITS: Limits = Object.freeze({
  maxStringLength: 10_000_000,
  maxArrayLength: 10_000_000,
  maxObjectKeys: 1_000_000,
  maxDepth: 1_000,
  maxSourceLength: 100_000,
  maxSteps: 100_000_000,
});

/**
 * Thrown when an expression would exceed one of the configured {@link Limits},
 * for example by producing a string or array that is too large, nesting too
 * deeply, or taking too many evaluation steps. Catchable, unlike the V8
 * out-of-memory fault it prevents.
 *
 * @group Errors
 */
export class ExpressionLimitError extends Error {
  /** Which limit was exceeded. */
  readonly limit: keyof Limits;

  constructor(limit: keyof Limits, message: string) {
    super(message);
    this.name = 'ExpressionLimitError';
    this.limit = limit;
  }
}

/** Merges partial overrides onto the defaults, keeping unspecified limits. */
export const resolveLimits = (overrides?: Partial<Limits>): Limits =>
  overrides ? Object.freeze({ ...DEFAULT_LIMITS, ...overrides }) : DEFAULT_LIMITS;

/** Throws unless a produced string would stay within `maxStringLength`. */
export const assertStringLength = (length: number, limits: Limits): void => {
  if (length > limits.maxStringLength) {
    throw new ExpressionLimitError(
      'maxStringLength',
      `string length ${length} exceeds the limit of ${limits.maxStringLength}`,
    );
  }
};

/** Throws unless a produced array would stay within `maxArrayLength`. */
export const assertArrayLength = (length: number, limits: Limits): void => {
  if (length > limits.maxArrayLength) {
    throw new ExpressionLimitError(
      'maxArrayLength',
      `array length ${length} exceeds the limit of ${limits.maxArrayLength}`,
    );
  }
};

/** Throws unless an object literal would stay within `maxObjectKeys`. */
export const assertObjectKeys = (count: number, limits: Limits): void => {
  if (count > limits.maxObjectKeys) {
    throw new ExpressionLimitError(
      'maxObjectKeys',
      `object with ${count} keys exceeds the limit of ${limits.maxObjectKeys}`,
    );
  }
};
