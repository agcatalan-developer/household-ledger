import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'scripts/**',
      'server/scripts/**',
      '**/*.mjs',
      '**/*.config.{js,ts}',
      'vitest.workspace.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
    linterOptions: { reportUnusedDisableDirectives: false },
  },
  {
    // The client must use the local clock, never UTC. toISOString() is banned (Phase 6).
    // parseFloat / "* 100" on money is banned (Phase 7).
    files: ['client/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='toISOString']",
          message: 'toISOString() is UTC — use todayLocal() / formatLocal() (Phase 6).',
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'parseFloat on money loses cents — use parseAmount() (Phase 7).',
        },
      ],
    },
  },
  {
    // process.env is read in config.ts and nowhere else (Phase 1).
    files: ['server/src/**/*.ts'],
    ignores: ['server/src/config.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.property.name='env'][object.object.name='process']",
          message: 'process.env is read only in config.ts (Phase 1).',
        },
      ],
    },
  },
);
