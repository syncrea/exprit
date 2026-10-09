import { parseArgs } from 'node:util';

import type { Dialect } from '@syncrea/exprit';

export interface CliOptions {
  readonly dialect: Dialect;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly isJson: boolean;
  readonly shouldShowHelp: boolean;
  readonly shouldShowVersion: boolean;
  readonly expression?: string;
}

export type ArgsResult =
  | { readonly success: true; readonly value: CliOptions }
  | { readonly success: false; readonly error: string };

export const USAGE = `Usage: exprit [options] [expression]

Evaluates an expression and prints the result. Without an expression, reads
one expression per line from stdin, or starts an interactive REPL in a terminal.

Options:
  -d, --dialect <name>   legacy (expr-eval syntax, default) or modern (JavaScript syntax)
  -v, --var <name=value> set a variable; the value is parsed as JSON, else kept as a string
  -j, --json             print results as JSON
  -h, --help             show this help
      --version          show the version

Examples:
  exprit "2 ^ 10"
  exprit -v x=3 "2 * x + 1"
  exprit -d modern -v 'items=[1,2,3]' "items.filter(i => i > 1)"
  echo "sqrt(16)" | exprit`;

const isDialect = (value: string): value is Dialect =>
  value === 'legacy' || value === 'modern';

/** Parses a `--var` value as JSON so numbers, booleans and arrays keep their type. */
const parseValue = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Not JSON: a bare word such as `--var name=Ada` is meant as a string.
    return raw;
  }
};

/** Turns command-line arguments into options without touching `process`. */
export const parseCliArgs = (argv: readonly string[]): ArgsResult => {
  let parsed: ReturnType<
    typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>
  >;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const { values, positionals } = parsed;
  const dialect = values.dialect ?? 'legacy';
  if (!isDialect(dialect)) {
    return {
      success: false,
      error: `Unknown dialect "${dialect}", expected legacy or modern`,
    };
  }

  const variables: Record<string, unknown> = {};
  for (const assignment of values.var ?? []) {
    const separator = assignment.indexOf('=');
    if (separator <= 0) {
      return {
        success: false,
        error: `Invalid --var "${assignment}", expected name=value`,
      };
    }
    variables[assignment.slice(0, separator)] = parseValue(
      assignment.slice(separator + 1),
    );
  }

  return {
    success: true,
    value: {
      dialect,
      variables,
      isJson: values.json ?? false,
      shouldShowHelp: values.help ?? false,
      shouldShowVersion: values.version ?? false,
      expression: positionals.length > 0 ? positionals.join(' ') : undefined,
    },
  };
};

const OPTIONS = {
  dialect: { type: 'string', short: 'd' },
  var: { type: 'string', short: 'v', multiple: true },
  json: { type: 'boolean', short: 'j' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
} as const;
