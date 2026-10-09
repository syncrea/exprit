import { createRequire } from 'node:module';

import { runCli } from './lib/run';

// Read at runtime, not bundled: a bundled copy is frozen at build time and
// reports the previous version when the release bumps it after the build.
const { version } = createRequire(import.meta.url)('../package.json') as {
  readonly version: string;
};

const exitCode = await runCli(
  process.argv.slice(2),
  {
    stdin: process.stdin,
    isInteractive: Boolean(process.stdin.isTTY),
    terminal: process.stdin.isTTY ? process.stdout : undefined,
    isOutputTty: Boolean(process.stdout.isTTY),
    writeOut: (text) => process.stdout.write(text),
    writeErr: (text) => process.stderr.write(text),
  },
  version,
);
process.exitCode = exitCode;
