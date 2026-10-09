#!/usr/bin/env node
// Copies expr-eval's mocha test suite into the conformance suite, converting
// its CommonJS requires to ESM imports. The test bodies are left untouched.
//
// Usage: node tools/scripts/vendor-expr-eval-tests.mjs <path-to-expr-eval-checkout>
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error(
    'usage: vendor-expr-eval-tests.mjs <path-to-expr-eval-checkout>',
  );
  process.exit(1);
}

const target = resolve(
  import.meta.dirname,
  '../../packages/exprit/conformance/expr-eval',
);
mkdirSync(join(target, 'lib'), { recursive: true });

for (const name of ['expression', 'functions', 'operators', 'parser']) {
  const text = readFileSync(join(source, 'test', `${name}.js`), 'utf8')
    .replace(
      "var assert = require('assert');",
      "import assert from 'node:assert';",
    )
    .replace(
      "var Parser = require('../dist/bundle').Parser;",
      "import { Parser } from 'conformance-target';",
    )
    .replace(
      "var spy = require('./lib/spy');",
      "import spy from './lib/spy.js';",
    );
  if (/require\(/.test(text)) {
    throw new Error(`${name}.js still contains a require() call`);
  }
  writeFileSync(join(target, `${name}.test.js`), text);
}

const spy = readFileSync(join(source, 'test/lib/spy.js'), 'utf8').replace(
  'module.exports = function',
  'export default function',
);
writeFileSync(join(target, 'lib/spy.js'), spy);
copyFileSync(join(source, 'LICENSE.txt'), join(target, 'LICENSE.txt'));
console.log(`vendored expr-eval tests into ${target}`);
