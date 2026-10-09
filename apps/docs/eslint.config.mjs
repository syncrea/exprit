import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: [
      'dist',
      '.astro',
      '.generated',
      'test-results',
      'playwright-report',
    ],
  },
];
