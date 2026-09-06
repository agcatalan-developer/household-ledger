import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'server',
      root: './server',
      environment: 'node',
      include: ['test/unit/**/*.test.ts', 'src/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        all: false,
        include: ['src/money/**'],
        thresholds: {
          // §13: the money module is the part where a gap is a wrong number on a
          // screen, so it is the only part with a threshold. No repo-wide target.
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
  {
    test: {
      name: 'client',
      root: './client',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'e2e',
      root: './server',
      environment: 'node',
      include: ['test/e2e/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 60000,
      // Every e2e test shares one database, one connection pool, and one
      // in-memory rate limiter — they must run one at a time.
      fileParallelism: false,
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      sequence: { concurrent: false },
      globalSetup: ['./test/e2e/global-setup.ts'],
      env: {
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ?? 'mysql://hl:hlpw@localhost:3307/household_ledger_test',
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ?? 'mysql://hl:hlpw@localhost:3307/household_ledger_test',
        JWT_SECRET: 'test-secret-abcdefghijklmnopqrstuvwxyz-0123456789',
        NODE_ENV: 'test',
        PORT: '3999',
      },
    },
  },
]);
