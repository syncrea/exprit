#!/usr/bin/env node
// Packs @syncrea/exprit exactly as `npm publish` would, installs the tarball
// into a throwaway consumer project, and typechecks code that imports it in
// every module setup a consumer might use, with skipLibCheck off so errors in
// the published declarations surface. Run after `pnpm nx build exprit`.
//
// Usage: node tools/scripts/check-package-types.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tsc = join(root, 'node_modules/typescript/bin/tsc');
const work = mkdtempSync(join(tmpdir(), 'exprit-types-'));

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

const CONSUMER = `import {
  createEnvironment, parse, evaluate, Parser, ExpressionLimitError,
  type Environment, type ParsedExpression,
} from '@syncrea/exprit';
import { parseModern, legacyFunctions, type ExpressionNode } from '@syncrea/exprit/core';

const env: Environment = createEnvironment({ dialect: 'modern', limits: { maxStringLength: 1000 } });
const expr: ParsedExpression = parse('a + 1', env);
const value: unknown = evaluate(expr, { a: 1 });
const ast: ExpressionNode = parseModern('a');
// expr-eval code assigns results to number directly; the compat API must allow it.
const total: number = Parser.evaluate('1 + 1');
const add: (a: unknown, b: unknown) => number = legacyFunctions.add;
const error: ExpressionLimitError | undefined = undefined;
// @ts-expect-error environments are readonly
env.dialect = 'legacy';
console.log(value, ast.type, total, add, error);
`;

const SETUPS = [
  {
    name: 'nodenext, CommonJS consumer',
    file: 'consumer.cts',
    module: 'nodenext',
    resolution: 'nodenext',
  },
  {
    name: 'nodenext, ESM consumer',
    file: 'consumer.mts',
    module: 'nodenext',
    resolution: 'nodenext',
  },
  {
    name: 'bundler',
    file: 'consumer.ts',
    module: 'esnext',
    resolution: 'bundler',
  },
  {
    name: 'node10 (legacy CommonJS)',
    file: 'consumer.ts',
    module: 'commonjs',
    resolution: 'node10',
  },
];

let failed = 0;
try {
  const tarball = run(
    'npm',
    ['pack', '--silent', '--pack-destination', work],
    join(root, 'packages/exprit'),
  ).trim();
  writeFileSync(
    join(work, 'package.json'),
    '{ "name": "consumer", "private": true }\n',
  );
  run(
    'npm',
    [
      'install',
      '--silent',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      join(work, tarball),
    ],
    work,
  );

  for (const setup of SETUPS) {
    writeFileSync(join(work, setup.file), CONSUMER);
    const args = [
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      'false',
      '--target',
      'es2022',
      '--module',
      setup.module,
      '--moduleResolution',
      setup.resolution,
      ...(setup.resolution === 'node10' ? ['--ignoreDeprecations', '6.0'] : []),
      setup.file,
    ];
    try {
      run(process.execPath, [tsc, ...args], work);
      console.log(`ok   ${setup.name}`);
    } catch (error) {
      failed++;
      console.log(
        `FAIL ${setup.name}\n${String(error.stdout || error.message).trim()}`,
      );
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  failed
    ? `${failed} setup(s) failed`
    : 'published types are clean in every setup',
);
process.exitCode = failed ? 1 : 0;
