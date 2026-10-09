import { defineConfig } from 'tsdown';

/**
 * Bundles the internal @exprit/* libraries into the one published package, as
 * ESM and CommonJS with a single bundled type declaration per format.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  tsconfig: 'tsconfig.lib.json',
  dts: { build: true },
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  deps: { alwaysBundle: [/^@exprit\//] },
  // CommonJS consumers use `require('@syncrea/exprit').Parser`, as with expr-eval.
  outputOptions: { exports: 'named' },
});
