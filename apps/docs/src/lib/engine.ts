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
