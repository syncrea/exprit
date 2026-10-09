import packageJson from '../package.json' with { type: 'json' };

import { runCli } from './lib/run';

const exitCode = await runCli(
  process.argv.slice(2),
  {
    stdin: process.stdin,
    isInteractive: Boolean(process.stdin.isTTY),
    terminal: process.stdin.isTTY ? process.stdout : undefined,
    writeOut: (text) => process.stdout.write(text),
    writeErr: (text) => process.stderr.write(text),
  },
  packageJson.version,
);
process.exitCode = exitCode;
