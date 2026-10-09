import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          // The internal libs are bundled into @syncrea/exprit from source by
          // tsdown, so they intentionally have no build target of their own.
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          // The dependency direction from the build spec: core depends on
          // nothing, each dialect only on core + tokenizer, the CLI only on
          // the public package.
          depConstraints: [
            { sourceTag: 'layer:core', onlyDependOnLibsWithTags: [] },
            {
              sourceTag: 'layer:tokenizer',
              onlyDependOnLibsWithTags: ['layer:core'],
            },
            {
              sourceTag: 'layer:parser',
              onlyDependOnLibsWithTags: ['layer:core', 'layer:tokenizer'],
            },
            {
              sourceTag: 'layer:registry',
              onlyDependOnLibsWithTags: ['layer:core'],
            },
            {
              sourceTag: 'layer:public',
              onlyDependOnLibsWithTags: [
                'layer:core',
                'layer:tokenizer',
                'layer:parser',
                'layer:registry',
              ],
            },
            {
              sourceTag: 'layer:cli',
              onlyDependOnLibsWithTags: ['layer:public'],
            },
            // The docs site uses the library the way users do: only through
            // the published package.
            {
              sourceTag: 'layer:docs',
              onlyDependOnLibsWithTags: ['layer:public'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Rules from docs/typescript.md, enforced rather than only documented.
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Use a string literal union instead of an enum (docs/typescript.md).',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Tool config files (vitest, eslint) need default exports; source code does not.
    files: ['**/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Use a string literal union instead of an enum (docs/typescript.md).',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports only (docs/typescript.md).',
        },
      ],
    },
  },
];
