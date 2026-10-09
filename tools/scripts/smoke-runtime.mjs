#!/usr/bin/env node
// Runs the BUILT packages (no dev tooling) on the current Node version, so CI
// can prove the published code works on Node versions the test tools no
// longer support. Usage: node tools/scripts/smoke-runtime.mjs (after `pnpm build`)
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}`);
  if (!ok) {
    process.exitCode = 1;
  }
};

const esm = await import(`${root}packages/exprit/dist/index.js`);
const modern = esm.createEnvironment({ dialect: 'modern' });
check(
  'ESM modern',
  esm.evaluate(esm.parse('xs.map(x => x * 2)', modern), { xs: [1, 2] }),
  [2, 4],
);
check('ESM legacy', esm.evaluate(esm.parse('2 ^ x + fac(3)'), { x: 3 }), 14);
check('ESM compat', new esm.CompatParser().evaluate('x = 2; x * 21'), 42);
try {
  esm.evaluate(esm.parse('"x".repeat(1e9)', modern));
  check('ESM limits', 'no error', 'ExpressionLimitError');
} catch (error) {
  check('ESM limits', error.constructor.name, 'ExpressionLimitError');
}

const cjs = require(`${root}packages/exprit/dist/index.cjs`);
check('CJS drop-in', cjs.Parser.evaluate('sqrt(16) + 1'), 5);

const cli = execFileSync(
  process.execPath,
  [`${root}packages/cli/dist/main.mjs`, '-d', 'modern', '-v', 'x=20', 'x + 1'],
  {
    encoding: 'utf8',
  },
).trim();
check('CLI', cli, '21');

console.log(
  `node ${process.version}: ${process.exitCode ? 'FAILED' : 'all good'}`,
);
