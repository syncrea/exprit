import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/cli',
  // Test against the exprit sources, not its build output.
  resolve: {
    alias: {
      '@syncrea/exprit': fileURLToPath(
        new URL('../exprit/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'cli',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
