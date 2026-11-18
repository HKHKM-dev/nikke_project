import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/dist/', '**/.cache/', '**/.claude/', 'packages/core/data/', 'scratch/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: [
      'packages/core/scripts/**/*.ts',
      'apps/web/scripts/**/*.ts',
      'tools/**/*.ts',
      '**/*.config.ts',
      'eslint.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // テストの道具の写しを作らない（plan/design-test-helpers.md）。データの読み込みは __tests__/data.ts、枠は
    // __tests__/teamHelpers.ts の fixedSlot を使う
    files: ['packages/core/src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: ':matches(FunctionDeclaration, VariableDeclarator)[id.name=/^(readJson|fixedSlot)$/]',
          message:
            'テストに readJson・fixedSlot の写しを作らない。__tests__/data.ts（readData・characterOf・rawDefinition）と __tests__/teamHelpers.ts（fixedSlot）を使う',
        },
      ],
    },
  },
  {
    files: ['apps/**/*.tsx', 'apps/**/*.ts'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  prettier,
);
