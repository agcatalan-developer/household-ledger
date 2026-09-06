// Creates the two users AND their household_members rows from SEED_A_* / SEED_B_*,
// argon2id-hashed in Node. No credential reaches git history. Idempotent on email.
// Runs after `npm run migrate`. This script — not config.ts — validates SEED_*.
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from './pool.js';

const SEED_HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000001';

export type SeedEnvShape = Record<string, string | undefined>;

const SeedEnv = z.object({
  SEED_A_EMAIL: z.string().email(),
  SEED_A_PASSWORD: z.string().min(8),
  SEED_B_EMAIL: z.string().email(),
  SEED_B_PASSWORD: z.string().min(8),
});

export async function seedUsers(env: SeedEnvShape, log: (m: string) => void = () => {}) {
  const parsed = SeedEnv.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `SEED_* missing or invalid:\n${parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  const people = [
    { email: parsed.data.SEED_A_EMAIL, password: parsed.data.SEED_A_PASSWORD, role: 'owner' as const },
    { email: parsed.data.SEED_B_EMAIL, password: parsed.data.SEED_B_PASSWORD, role: 'member' as const },
  ];

  for (const p of people) {
    const email = p.email.toLowerCase();
    const [existing] = await pool.query<RowDataPacket[]>(`SELECT id FROM users WHERE email = ?`, [
      email,
    ]);
    if (existing[0]) {
      log(`= ${email} (exists)`);
      continue;
    }
    const id = randomUUID();
    const hash = await argon2.hash(p.password, { type: argon2.argon2id });
    const displayName = email.split('@')[0] ?? 'User';
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query<ResultSetHeader>(
        `INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)`,
        [id, email, hash, displayName],
      );
      await conn.query<ResultSetHeader>(
        `INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)`,
        [SEED_HOUSEHOLD_ID, id, p.role],
      );
      await conn.commit();
      log(`+ ${email}`);
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }
}
