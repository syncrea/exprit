import { defineConfig } from 'tsdown';

/** Bundles the CLI as one executable ESM file; @syncrea/exprit stays a dependency. */
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
  clean: true,
  outDir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
});
