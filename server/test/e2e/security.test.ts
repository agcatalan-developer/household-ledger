import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAT, closePool, loginAna, loginMallory, request, resetHousehold1, uuid } from './helpers.js';
import { HOUSEHOLD_2 } from './global-setup.js';

beforeEach(resetHousehold1);
afterAll(closePool);

describe('cross-household isolation — every by-id route answers 404, never 403', () => {
  it('GET / PATCH / DELETE a transaction from another household → 404', async () => {
    const ana = await loginAna();
    const id = HOUSEHOLD_2.transactionId;
    expect((await ana.get(`/api/transactions?period=2026-09&categoryId=${HOUSEHOLD_2.categoryId}`)).body.transactions).toHaveLength(0);
    expect((await ana.patch(`/api/transactions/${id}`).send({ amountMinor: 1 })).status).toBe(404);
    expect((await ana.delete(`/api/transactions/${id}`)).status).toBe(404);
  });

  it("another household's category is invisible to PATCH and budget PUT → 404", async () => {
    const ana = await loginAna();
    expect(
      (await ana.patch(`/api/categories/${HOUSEHOLD_2.categoryId}`).send({ name: 'x' })).status,
    ).toBe(404);
    expect(
      (await ana.put(`/api/budget/${HOUSEHOLD_2.categoryId}?period=2026-09`).send({ plannedMinor: 100 }))
        .status,
    ).toBe(404);
  });

  it("Mallory cannot see Home's data", async () => {
    const mallory = await loginMallory();
    const summary = await mallory.get('/api/summary?period=2026-09');
    expect(summary.status).toBe(200);
    // She sees only her own household's rows, never Home's.
    expect(
      summary.body.budgetRows.every(
        (r: { categoryId: string }) => r.categoryId === HOUSEHOLD_2.categoryId,
      ),
    ).toBe(true);
    const cats = await mallory.get('/api/categories');
    expect(cats.body.categories.every((c: { name: string }) => c.name === 'Their groceries')).toBe(true);
  });
});

describe('the server-owned field registry — every field refused with 400', () => {
  const SERVER_OWNED = [
    'householdId',
    'createdBy',
    'updatedBy',
    'createdAt',
    'updatedAt',
    'period',
    'sweptFromPeriod',
  ];

  it('rejected on POST /api/transactions', async () => {
    const ana = await loginAna();
    for (const field of SERVER_OWNED) {
      const res = await ana
        .post('/api/transactions')
        .send({
          id: uuid(),
          categoryId: CAT.groceries,
          amountMinor: 1000,
          txnDate: '2026-09-03',
          [field]: 'x',
        });
      expect(res.status, `field ${field}`).toBe(400);
    }
  });

  it('rejected on PATCH /api/transactions/:id', async () => {
    const ana = await loginAna();
    const id = uuid();
    await ana
      .post('/api/transactions')
      .send({ id, categoryId: CAT.groceries, amountMinor: 1000, txnDate: '2026-09-03' });
    for (const field of SERVER_OWNED) {
      const res = await ana.patch(`/api/transactions/${id}`).send({ [field]: 'x' });
      expect(res.status, `field ${field}`).toBe(400);
    }
  });

  it('type is rejected on PATCH /api/categories/:id but accepted on POST', async () => {
    const ana = await loginAna();
    const created = await ana
      .post('/api/categories')
      .send({ name: 'Pets', type: 'expense' });
    expect(created.status).toBe(201);
    const patched = await ana
      .patch(`/api/categories/${created.body.category.id}`)
      .send({ type: 'income' });
    expect(patched.status).toBe(400);
  });
});

describe('auth edges', () => {
  it('unknown field in a body → 400, not silently dropped', async () => {
    const ana = await loginAna();
    const res = await ana
      .post('/api/transactions')
      .send({ id: uuid(), categoryId: CAT.groceries, amountMinor: 1000, txnDate: '2026-09-03', foo: 1 });
    expect(res.status).toBe(400);
  });

  it('a forced 500 leaks no SQL, stack, or constraint name, and carries a request id', async () => {
    const ana = await loginAna();
    // amount over INT UNSIGNED max slips past Zod (positive int) but the DB rejects it
    const res = await ana
      .post('/api/transactions')
      .send({ id: uuid(), categoryId: CAT.groceries, amountMinor: 999999999999, txnDate: '2026-09-03' });
    expect([400, 500]).toContain(res.status);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/INSERT|SELECT|constraint|sqlMessage|ER_/i);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('6th login attempt within the window → 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request().post('/api/auth/login').send({ email: 'x@example.com', password: 'no' });
    }
    const sixth = await request().post('/api/auth/login').send({ email: 'x@example.com', password: 'no' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('log scrub — the request log is an allowlist', () => {
  it('a captured log stream contains no amount, email, or token', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.map(String).join(' '));
    });
    try {
      const ana = await loginAna();
      await ana
        .post('/api/transactions')
        .send({ id: uuid(), categoryId: CAT.groceries, amountMinor: 8541, txnDate: '2026-09-03' });
      await ana.get('/api/auth/me');
    } finally {
      spy.mockRestore();
    }
    const blob = lines.join('\n');
    expect(blob).not.toContain('8541');
    expect(blob).not.toContain('ana@example.com');
    expect(blob).not.toMatch(/eyJ[A-Za-z0-9_-]+\./); // a JWT
  });
});
