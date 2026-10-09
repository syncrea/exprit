import { createInterface } from 'node:readline';

import {
  createEnvironment,
  evaluateWithState,
  extend,
  parse,
  type Environment,
  type Variables,
} from '@syncrea/exprit';

import { parseCliArgs, USAGE } from './args';

/** Where the CLI reads and writes. Injected so the CLI can be tested without a process. */
export interface CliIo {
  readonly stdin: NodeJS.ReadableStream;
  readonly isInteractive: boolean;
  /** The terminal, when there is one; enables line editing and history in the REPL. */
  readonly terminal?: NodeJS.WritableStream;
  /** Whether results go to a terminal; control characters are escaped if so. */
  readonly isOutputTty?: boolean;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (text: string) => void;
}

/**
 * Escapes C0/C1 control characters (except newline and tab) as `\xHH`, so an
 * attacker-controlled result cannot inject cursor-movement or other terminal
 * escape sequences into the operator's terminal (F7).
 */
export const escapeControlCharacters = (text: string): string =>
  // eslint-disable-next-line no-control-regex -- intentionally matching control chars to neutralise them
  text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (character) => {
    const code = character.charCodeAt(0);
    return `\\x${code.toString(16).padStart(2, '0')}`;
  });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Renders a result for the terminal: strings bare, data as JSON. */
export const formatResult = (value: unknown, isJson = false): string => {
  if (typeof value === 'function') {
    return `[Function${value.name ? ` ${value.name}` : ''}]`;
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (isJson || (value !== null && typeof value === 'object')) {
    return JSON.stringify(value) ?? String(value);
  }
  return String(value);
};

/** The REPL's state. Each evaluated line produces a new session. */
interface Session {
  readonly env: Environment;
  readonly variables: Variables;
  readonly isJson: boolean;
}

interface LineResult {
  readonly session: Session;
  readonly isSuccess: boolean;
}

/** Evaluates one line; legacy assignments carry over into the next session. */
const evaluateLine = (
  session: Session,
  line: string,
  io: CliIo,
): LineResult => {
  try {
    const { value, variables } = evaluateWithState(
      parse(line, session.env),
      session.variables,
    );
    const formatted = formatResult(value, session.isJson);
    io.writeOut(`${io.isOutputTty ? escapeControlCharacters(formatted) : formatted}\n`);
    return { session: { ...session, variables }, isSuccess: true };
  } catch (error) {
    io.writeErr(`${errorMessage(error)}\n`);
    return { session, isSuccess: false };
  }
};

const REPL_HELP = `Commands:
  .dialect [legacy|modern]  show or switch the dialect
  .vars                     list variables
  .help                     show this help
  .exit                     quit (or press Ctrl+D)`;

const runRepl = async (initial: Session, io: CliIo): Promise<number> => {
  let session = initial;
  const prompt = (): string => `exprit(${session.env.dialect})> `;
  const lines = createInterface({
    input: io.stdin,
    output: io.terminal,
    terminal: io.terminal !== undefined,
  });
  io.writeOut(
    `exprit REPL, ${session.env.dialect} dialect. Type .help for commands.\n${prompt()}`,
  );

  for await (const raw of lines) {
    const line = raw.trim();
    if (line === '.exit') {
      break;
    }
    if (line === '.help') {
      io.writeOut(`${REPL_HELP}\n`);
    } else if (line === '.vars') {
      io.writeOut(`${formatResult(session.variables, true)}\n`);
    } else if (line.startsWith('.dialect')) {
      const next = line.slice('.dialect'.length).trim();
      if (next === 'legacy' || next === 'modern') {
        session = { ...session, env: extend(session.env, { dialect: next }) };
      } else if (next !== '') {
        io.writeErr(`Unknown dialect "${next}", expected legacy or modern\n`);
      }
      io.writeOut(`dialect: ${session.env.dialect}\n`);
    } else if (line !== '') {
      session = evaluateLine(session, line, io).session;
    }
    io.writeOut(prompt());
  }
  io.writeOut('\n');
  return 0;
};

const runLines = async (initial: Session, io: CliIo): Promise<number> => {
  let session = initial;
  let exitCode = 0;
  for await (const raw of createInterface({
    input: io.stdin,
    terminal: false,
  })) {
    const line = raw.trim();
    if (line !== '') {
      const result = evaluateLine(session, line, io);
      session = result.session;
      exitCode = result.isSuccess ? exitCode : 1;
    }
  }
  return exitCode;
};

/**
 * Runs the CLI and resolves with its exit code.
 *
 * @param argv - Arguments after the executable name
 * @param io - Streams to read from and write to
 * @param version - Version reported by `--version`
 */
export const runCli = async (
  argv: readonly string[],
  io: CliIo,
  version: string,
): Promise<number> => {
  const args = parseCliArgs(argv);
  if (!args.success) {
    io.writeErr(`${args.error}\n\n${USAGE}\n`);
    return 2;
  }
  const options = args.value;
  if (options.shouldShowHelp) {
    io.writeOut(`${USAGE}\n`);
    return 0;
  }
  if (options.shouldShowVersion) {
    io.writeOut(`${version}\n`);
    return 0;
  }

  const session: Session = {
    env: createEnvironment({ dialect: options.dialect }),
    variables: options.variables,
    isJson: options.isJson,
  };
  if (options.expression !== undefined) {
    return evaluateLine(session, options.expression, io).isSuccess ? 0 : 1;
  }
  return io.isInteractive ? runRepl(session, io) : runLines(session, io);
};
