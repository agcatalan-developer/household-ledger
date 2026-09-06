import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CAT, closePool, loginAna, resetHousehold1, uuid } from './helpers.js';
import { pool } from '../../src/db/pool.js';

beforeEach(resetHousehold1);
afterAll(closePool);

describe('the month boundary — period is generated from txn_date', () => {
  it('23:00 on 31 Aug lands in August; 00:30 on 1 Sep lands in September', async () => {
    const agent = await loginAna();
    const aug = uuid();
    const sep = uuid();
    await agent
      .post('/api/transactions')
      .send({ id: aug, categoryId: CAT.groceries, amountMinor: 100, txnDate: '2026-08-31' });
    await agent
      .post('/api/transactions')
      .send({ id: sep, categoryId: CAT.groceries, amountMinor: 200, txnDate: '2026-09-01' });

    const [rows] = await pool.query(
      'SELECT id, period FROM transactions WHERE id IN (?, ?)',
      [aug, sep],
    );
    const byId = Object.fromEntries((rows as { id: string; period: string }[]).map((r) => [r.id, r.period]));
    expect(byId[aug]).toBe('2026-08');
    expect(byId[sep]).toBe('2026-09');
  });

  it('moving a date across the boundary makes period follow on its own', async () => {
    const agent = await loginAna();
    const id = uuid();
    await agent
      .post('/api/transactions')
      .send({ id, categoryId: CAT.groceries, amountMinor: 100, txnDate: '2026-08-31' });
    await agent.patch(`/api/transactions/${id}`).send({ txnDate: '2026-09-02' });
    const [rows] = await pool.query('SELECT period FROM transactions WHERE id = ?', [id]);
    expect((rows as { period: string }[])[0]!.period).toBe('2026-09');
  });
});

describe('idempotency the schema enforces', () => {
  it('copy twice → no duplicate lines, and an edited line is not reverted', async () => {
    const agent = await loginAna();
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-08`).send({ plannedMinor: 100000 });
    await agent.put(`/api/budget/${CAT.transport}?period=2026-08`).send({ plannedMinor: 30000 });

    const first = await agent.post('/api/budget/copy').send({ from: '2026-08', to: '2026-09' });
    expect(first.body).toEqual({ copied: 2, skipped: 0 });

    // edit September's groceries line
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-09`).send({ plannedMinor: 111111 });

    const second = await agent.post('/api/budget/copy').send({ from: '2026-08', to: '2026-09' });
    expect(second.body).toEqual({ copied: 0, skipped: 2 });

    const sep = await agent.get('/api/budget?period=2026-09');
    const groceries = sep.body.rows.find((r: { categoryId: string }) => r.categoryId === CAT.groceries);
    expect(groceries.plannedMinor).toBe(111111); // not reverted

    const [count] = await pool.query(
      "SELECT COUNT(*) AS n FROM budget_lines WHERE period = '2026-09' AND household_id = '00000000-0000-4000-8000-000000000001'",
    );
    expect((count as { n: number }[])[0]!.n).toBe(2);
  });

  it('copy skips a category archived after the source month', async () => {
    const agent = await loginAna();
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-08`).send({ plannedMinor: 100000 });
    await agent.put(`/api/budget/${CAT.transport}?period=2026-08`).send({ plannedMinor: 30000 });
    await agent.patch(`/api/categories/${CAT.transport}`).send({ archivedAt: '2026-09-01T00:00:00Z' });

    const copy = await agent.post('/api/budget/copy').send({ from: '2026-08', to: '2026-09' });
    expect(copy.body).toEqual({ copied: 1, skipped: 1 });
  });

  it('sweep twice → second is 409, and exactly one transaction exists', async () => {
    const agent = await loginAna();
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-08`).send({ plannedMinor: 50000 });

    const first = await agent
      .post('/api/budget/sweep')
      .send({ from: '2026-08', categoryId: CAT.emergencyFund });
    expect(first.status).toBe(201);

    const second = await agent
      .post('/api/budget/sweep')
      .send({ from: '2026-08', categoryId: CAT.emergencyFund });
    expect(second.status).toBe(409);

    const [rows] = await pool.query(
      "SELECT COUNT(*) AS n FROM transactions WHERE swept_from_period = '2026-08' AND household_id = '00000000-0000-4000-8000-000000000001'",
    );
    expect((rows as { n: number }[])[0]!.n).toBe(1);
  });

  it('PUT budget with plannedMinor 0 deletes the line', async () => {
    const agent = await loginAna();
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-09`).send({ plannedMinor: 5000 });
    const del = await agent.put(`/api/budget/${CAT.groceries}?period=2026-09`).send({ plannedMinor: 0 });
    expect(del.status).toBe(204);
    const sep = await agent.get('/api/budget?period=2026-09');
    const row = sep.body.rows.find((r: { categoryId: string }) => r.categoryId === CAT.groceries);
    expect(row.plannedMinor).toBe(0);
  });

  it('a budget line against an income category → 400', async () => {
    const agent = await loginAna();
    const res = await agent.put(`/api/budget/${CAT.salary}?period=2026-09`).send({ plannedMinor: 5000 });
    expect(res.status).toBe(400);
  });
});

describe('savings', () => {
  it('total equals the sum of goals shown; archived-with-balance still counts', async () => {
    const agent = await loginAna();
    await agent
      .post('/api/transactions')
      .send({ id: uuid(), categoryId: CAT.emergencyFund, amountMinor: 8000, txnDate: '2026-09-02' });
    const created = await agent.post('/api/categories').send({ name: 'Car', type: 'savings' });
    await agent
      .post('/api/transactions')
      .send({ id: uuid(), categoryId: created.body.category.id, amountMinor: 2000, txnDate: '2026-09-02' });
    await agent.patch(`/api/categories/${created.body.category.id}`).send({ archivedAt: '2026-09-03T00:00:00Z' });

    const savings = await agent.get('/api/savings');
    const shown = savings.body.goals.reduce((a: number, g: { savedMinor: number }) => a + g.savedMinor, 0);
    expect(savings.body.savingsTotalMinor).toBe(10000);
    expect(shown).toBe(10000);
    expect(savings.body.goals.find((g: { name: string }) => g.name === 'Car').archived).toBe(true);
  });

  it('setting a target on an expense category is rejected', async () => {
    const agent = await loginAna();
    const res = await agent.patch(`/api/categories/${CAT.groceries}`).send({ targetAmountMinor: 100000 });
    expect(res.status).toBe(400);
  });
});
