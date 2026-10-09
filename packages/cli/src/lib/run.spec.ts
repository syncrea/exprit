import { Readable } from 'node:stream';

import { escapeControlCharacters, formatResult, runCli } from './run';

interface Captured {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

const run = async (
  argv: string[],
  input = '',
  isInteractive = false,
): Promise<Captured> => {
  let out = '';
  let err = '';
  const code = await runCli(
    argv,
    {
      stdin: Readable.from([input]),
      isInteractive,
      writeOut: (text) => {
        out += text;
      },
      writeErr: (text) => {
        err += text;
      },
    },
    '1.2.3',
  );
  return { code, out, err };
};

const runTty = async (argv: string[]): Promise<Captured> => {
  let out = '';
  let err = '';
  const code = await runCli(
    argv,
    {
      stdin: Readable.from(['']),
      isInteractive: false,
      isOutputTty: true,
      writeOut: (text) => {
        out += text;
      },
      writeErr: (text) => {
        err += text;
      },
    },
    '1.2.3',
  );
  return { code, out, err };
};

describe('runCli', () => {
  it('escapes terminal control sequences when writing to a tty (F7)', async () => {
    const result = await runTty(['-d', 'modern', '"\\u001b[31mRED\\u001b[0m"']);
    expect(result.out).not.toContain('\u001b');
    expect(result.out).toBe('\\x1b[31mRED\\x1b[0m\n');
  });

  it('does not escape control characters when output is not a tty', async () => {
    const result = await run(['-d', 'modern', '"\\u001b[31mRED"']);
    expect(result.out).toBe('\u001b[31mRED\n');
  });

  it('escapeControlCharacters leaves newlines and tabs intact', () => {
    expect(escapeControlCharacters('a\tb\nc')).toBe('a\tb\nc');
    expect(escapeControlCharacters('x\u0007\u001by')).toBe('x\\x07\\x1by');
  });

  it('evaluates a one-shot expression', async () => {
    expect(await run(['2 ^ 10'])).toEqual({ code: 0, out: '1024\n', err: '' });
  });

  it('passes typed variables from --var', async () => {
    expect(
      (await run(['-v', 'x=3', '-v', 'name=Ada', 'x * 2 || name'])).out,
    ).toBe('6Ada\n');
  });

  it('switches dialect with --dialect', async () => {
    const result = await run([
      '-d',
      'modern',
      '-v',
      'xs=[1,2,3]',
      'xs.filter(x => x > 1)',
    ]);
    expect(result.out).toBe('[2,3]\n');
  });

  it('prints JSON with --json', async () => {
    expect((await run(['--json', '"a" || "b"'])).out).toBe('"ab"\n');
  });

  it('reads one expression per line from stdin, keeping assignments', async () => {
    const result = await run([], 'x = 2\n\nx * 21\n');
    expect(result).toEqual({ code: 0, out: '2\n42\n', err: '' });
  });

  it('reports errors on stderr with exit code 1', async () => {
    const result = await run(['1 +']);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/parse error/);
  });

  it('rejects unknown dialects with exit code 2', async () => {
    const result = await run(['-d', 'cobol', '1']);
    expect(result.code).toBe(2);
    expect(result.err).toMatch(/Unknown dialect "cobol"/);
  });

  it('shows the version', async () => {
    expect((await run(['--version'])).out).toBe('1.2.3\n');
  });

  it('runs REPL commands and switches dialect', async () => {
    const result = await run(
      [],
      '1 + 1\n.dialect modern\n[1, 2].length\n.exit\n',
      true,
    );
    expect(result.out).toContain('exprit(legacy)> 2\n');
    expect(result.out).toContain('dialect: modern\nexprit(modern)> 2\n');
  });
});

describe('formatResult', () => {
  it.each([
    ['text', 'text'],
    [1.5, '1.5'],
    [undefined, 'undefined'],
    [null, 'null'],
    [{ a: [1] }, '{"a":[1]}'],
  ])('formats %j', (value, expected) => {
    expect(formatResult(value)).toBe(expected);
  });

  it('names functions', () => {
    expect(
      formatResult(function area() {
        return 0;
      }),
    ).toBe('[Function area]');
  });
});
