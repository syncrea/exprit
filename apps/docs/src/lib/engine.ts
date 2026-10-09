/**
 * Thin helpers around the real exprit engine, shared by the build-time
 * rendering and the browser islands. Everything here goes through the public
 * `@syncrea/exprit` API; nothing re-implements parsing or evaluation.
 */
import {
  createEnvironment,
  evaluate,
  ExpressionSecurityError,
  ExpressionSyntaxError,
  parse,
  type Dialect,
  type Environment,
  type ParsedExpression,
  type Variables,
} from '@syncrea/exprit';

export const DIALECTS: readonly Dialect[] = ['modern', 'legacy'];

const ENVIRONMENTS: Readonly<Record<Dialect, Environment>> = {
  legacy: createEnvironment({ dialect: 'legacy' }),
  modern: createEnvironment({ dialect: 'modern' }),
};

export const environmentFor = (dialect: Dialect): Environment =>
  ENVIRONMENTS[dialect];

export const isDialect = (value: unknown): value is Dialect =>
  value === 'legacy' || value === 'modern';

export interface ParsedOutcome {
  readonly kind: 'parsed';
  readonly expression: ParsedExpression;
}

export interface EmptyOutcome {
  readonly kind: 'empty';
  readonly message: string;
}

export interface SyntaxProblem {
  readonly kind: 'syntax';
  /** expr-eval style message, `parse error [line:column]: reason`. */
  readonly message: string;
  readonly reason: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export type ParseOutcome = ParsedOutcome | EmptyOutcome | SyntaxProblem;

export const parseSource = (source: string, dialect: Dialect): ParseOutcome => {
  if (source.trim() === '') {
    return { kind: 'empty', message: 'Type an expression' };
  }
  try {
    return {
      kind: 'parsed',
      expression: parse(source, environmentFor(dialect)),
    };
  } catch (error) {
    if (error instanceof ExpressionSyntaxError) {
      const { message, reason, line, column, offset } = error;
      return { kind: 'syntax', message, reason, line, column, offset };
    }
    throw error;
  }
};

export interface ValueOutcome {
  readonly kind: 'value';
  readonly value: unknown;
}

export interface RuntimeProblem {
  /** `security` when the sandbox blocked a name such as `constructor`. */
  readonly kind: 'runtime' | 'security';
  readonly message: string;
}

export type EvaluationOutcome = ValueOutcome | RuntimeProblem;

export const evaluateSafely = (
  expression: ParsedExpression,
  variables: Variables,
): EvaluationOutcome => {
  try {
    return { kind: 'value', value: evaluate(expression, variables) };
  } catch (error) {
    return {
      kind: error instanceof ExpressionSecurityError ? 'security' : 'runtime',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

export type RunOutcome =
  ValueOutcome | RuntimeProblem | EmptyOutcome | SyntaxProblem;

export interface Timing {
  /** Mean wall-clock time of one `evaluate` call, in nanoseconds. */
  readonly nanosecondsPerRun: number;
  /** How many evaluations the mean is over. */
  readonly runs: number;
}

/** A batch must run at least this long to dwarf the browser's coarse clock. */
const MIN_BATCH_MS = 2;
/** Total time the measurement may take, so typing never stalls. */
const BUDGET_MS = 10;
/** Untimed runs first, so the JIT has optimised the hot path before timing. */
const WARMUP_MS = 2;

/**
 * Measures how long one evaluation takes. Browsers round `performance.now()`
 * to 100 µs or more, far coarser than a single evaluation, so after a short
 * untimed warm-up this times batches of doubling size until one lasts
 * `MIN_BATCH_MS`, and reports that batch's mean. A slow expression gets one timed run instead of a loop.
 *
 * @returns The timing, or `undefined` if the expression throws
 */
export const measureEvaluation = (
  expression: ParsedExpression,
  variables: Variables,
  now: () => number = () => performance.now(),
): Timing | undefined => {
  const timeBatch = (runs: number): number => {
    const start = now();
    for (let i = 0; i < runs; i++) {
      evaluate(expression, variables);
    }
    return now() - start;
  };
  try {
    const started = now();
    while (now() - started < WARMUP_MS) {
      evaluate(expression, variables);
    }
    let runs = 1;
    let elapsed = timeBatch(runs);
    while (
      elapsed < MIN_BATCH_MS &&
      now() - started + elapsed * 2 < BUDGET_MS
    ) {
      runs *= 2;
      elapsed = timeBatch(runs);
    }
    return { nanosecondsPerRun: (elapsed / runs) * 1e6, runs };
  } catch {
    // The caller already shows the evaluation error; there is nothing to time.
    return undefined;
  }
};

const nanosecondFormat = new Intl.NumberFormat('en', {
  maximumFractionDigits: 0,
});

/** `1,234 ns`, rounded to whole nanoseconds. */
export const formatNanoseconds = (timing: Timing): string =>
  `${nanosecondFormat.format(timing.nanosecondsPerRun)} ns`;

/** `≈ 1,234 ns`: a measured mean, so marked as approximate. */
export const formatTiming = (timing: Timing): string =>
  `≈ ${formatNanoseconds(timing)}`;

export interface TimedOutcome {
  readonly outcome: RunOutcome;
  /** Present when the evaluation succeeded. */
  readonly timing?: Timing;
}

/**
 * Evaluates once for the result, then times it. The first run is timed too:
 * if it alone exceeds the budget, it is the measurement and the expression is
 * not run again.
 */
export const evaluateTimed = (
  expression: ParsedExpression,
  variables: Variables,
  now: () => number = () => performance.now(),
): TimedOutcome => {
  const start = now();
  const outcome = evaluateSafely(expression, variables);
  const firstRunMs = now() - start;
  if (outcome.kind !== 'value') {
    return { outcome };
  }
  const timing =
    firstRunMs >= BUDGET_MS
      ? { nanosecondsPerRun: firstRunMs * 1e6, runs: 1 }
      : measureEvaluation(expression, variables, now);
  return { outcome, timing };
};

/** Parses, evaluates and times in one go; used by the small inline demos. */
export const runTimed = (
  source: string,
  dialect: Dialect,
  variables: Variables,
): TimedOutcome => {
  const parsed = parseSource(source, dialect);
  return parsed.kind === 'parsed'
    ? evaluateTimed(parsed.expression, variables)
    : { outcome: parsed };
};

/** The tooltip that explains a timing. */
export const describeTiming = (timing: Timing): string =>
  `evaluate() took ${formatNanoseconds(timing)} on average over ${timing.runs.toLocaleString('en')} ${timing.runs === 1 ? 'run' : 'runs'} in this browser`;

/** Parses and evaluates in one go; used by the small inline demos. */
export const run = (
  source: string,
  dialect: Dialect,
  variables: Variables,
): RunOutcome => {
  const parsed = parseSource(source, dialect);
  return parsed.kind === 'parsed'
    ? evaluateSafely(parsed.expression, variables)
    : parsed;
};

export interface DescribedValue {
  readonly text: string;
  /** `number`, `string`, `boolean`, `array`, `object`, `null`, `undefined` or `function`. */
  readonly type: string;
  /** Long or multi-line results are shown smaller. */
  readonly isLong: boolean;
}

const jsonReplacer = (_key: string, value: unknown): unknown =>
  typeof value === 'function' ? '[function]' : value;

const typeOf = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'array' : typeof value;
};

const formatNumber = (value: number): string =>
  Object.is(value, -0) ? '-0' : String(value);

/** Formats an evaluation result for display. */
export const describeValue = (value: unknown): DescribedValue => {
  const type = typeOf(value);
  let text: string;
  if (typeof value === 'number') {
    text = formatNumber(value);
  } else if (typeof value === 'string') {
    text = JSON.stringify(value);
  } else if (typeof value === 'function') {
    text = 'ƒ (function)';
  } else if (type === 'array' || type === 'object') {
    const compact = JSON.stringify(value, jsonReplacer) ?? String(value);
    text =
      compact.length > 48
        ? (JSON.stringify(value, jsonReplacer, 2) ?? compact)
        : compact;
  } else {
    text = String(value);
  }
  return { text, type, isLong: text.length > 14 || text.includes('\n') };
};

export interface OutcomeView extends DescribedValue {
  readonly isError: boolean;
}

/** What a result display shows for an outcome; the same at build time and in the browser. */
export const viewOutcome = (outcome: RunOutcome): OutcomeView => {
  if (outcome.kind === 'value') {
    return { ...describeValue(outcome.value), isError: false };
  }
  return {
    text: outcome.message,
    type: outcome.kind === 'security' ? 'blocked by the sandbox' : 'error',
    isLong: false,
    isError: true,
  };
};
