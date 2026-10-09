import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';

import { sparkTheme } from './src/styles/shiki-theme.mjs';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: 'https://exprit.syncrea.ch',
  base: '/',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: sparkTheme,
    },
  },
  devToolbar: { enabled: false },
  vite: {
    // Pre-bundle the client-side dependencies when the dev server starts.
    // Discovered lazily, they make Vite re-optimize mid-session and the
    // already-open page fails with "504 (Outdated Optimize Dep)".
    optimizeDeps: {
      include: [
        '@codemirror/commands',
        '@codemirror/state',
        '@codemirror/view',
        '@syncrea/exprit',
      ],
    },
    build: {
      // Keep fonts as cacheable files instead of base64 inside the CSS.
      assetsInlineLimit: 0,
    },
  },
});
