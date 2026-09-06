// The only file in the server that reads process.env (Phase 1).
// Parsed once, at import. A bad value exits the process before the port is bound.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// .env lives at the repo root; this file sits two levels down in both src/ and dist/.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const RawEnv = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return parsed.pathname.replace(/^\//, '').length > 0;
      } catch {
        return false;
      }
    }, 'DATABASE_URL must include a database name'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = RawEnv.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`Invalid environment:\n${lines.join('\n')}`);
  process.exit(1);
}

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

export const config = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  db: Object.freeze(parseDbUrl(parsed.data.DATABASE_URL)),
});

export type Config = typeof config;
