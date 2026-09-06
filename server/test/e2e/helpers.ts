import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/db/pool.js';
import { resetRateLimit } from '../../src/middleware/rateLimit.js';

export const app = createApp();
export const request = () => supertest(app);

export const SEED_HOUSEHOLD = '00000000-0000-4000-8000-000000000001';
export const CAT = {
  groceries: '00000000-0000-4000-8000-000000000101',
  eatingOut: '00000000-0000-4000-8000-000000000102',
  transport: '00000000-0000-4000-8000-000000000103',
  salary: '00000000-0000-4000-8000-000000000201',
  emergencyFund: '00000000-0000-4000-8000-000000000301',
};

export async function loginAs(email: string, password: string): Promise<supertest.Agent> {
  const agent = supertest.agent(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

export const loginAna = () => loginAs('ana@example.com', 'ana-password-1');
export const loginBen = () => loginAs('ben@example.com', 'ben-password-1');
export const loginMallory = () => loginAs('mallory@example.com', 'mallory-password-1');

const SEED_CATEGORY_IDS = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000106',
  '00000000-0000-4000-8000-000000000107',
  '00000000-0000-4000-8000-000000000108',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000301',
];

/** Wipe household 1 back to seed state between tests. Household 2 is left intact. */
export async function resetHousehold1(): Promise<void> {
  resetRateLimit();
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM transactions WHERE household_id = ?', [SEED_HOUSEHOLD]);
    await conn.query('DELETE FROM budget_lines WHERE household_id = ?', [SEED_HOUSEHOLD]);
    await conn.query(
      `DELETE FROM categories WHERE household_id = ? AND id NOT IN (${SEED_CATEGORY_IDS.map(
        () => '?',
      ).join(',')})`,
      [SEED_HOUSEHOLD, ...SEED_CATEGORY_IDS],
    );
    await conn.query(
      'UPDATE categories SET archived_at = NULL, target_amount_minor = NULL WHERE household_id = ?',
      [SEED_HOUSEHOLD],
    );
  } finally {
    conn.release();
  }
}

export const uuid = () => randomUUID();

let poolClosed = false;
export async function closePool(): Promise<void> {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}
