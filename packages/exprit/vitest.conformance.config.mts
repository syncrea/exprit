import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Runs expr-eval's own test suite against exprit's legacy dialect.
 *
 * CONFORMANCE_TARGET picks what is tested:
 * - unset: exprit's TypeScript sources
 * - dist: the built bundle, exactly as published
 * - expr-eval: expr-eval itself, as a baseline for the suite
 */
const targets: Readonly<Record<string, string>> = {
  'expr-eval': 'expr-eval',
  dist: fileURLToPath(new URL('./dist/index.js', import.meta.url)),
  src: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
};
const target =
  targets[process.env['CONFORMANCE_TARGET'] ?? 'src'] ?? targets['src'];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/exprit-conformance',
  resolve: {
    alias: { 'conformance-target': target },
  },
  test: {
    name: 'exprit-conformance',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['conformance/**/*.test.js'],
    setupFiles: ['conformance/known-deltas.setup.ts'],
    reporters: ['default'],
  },
}));
