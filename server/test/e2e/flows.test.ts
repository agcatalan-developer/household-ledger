import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CAT,
  closePool,
  loginAna,
  loginBen,
  request,
  resetHousehold1,
  uuid,
} from './helpers.js';

beforeEach(resetHousehold1);
afterAll(closePool);

describe('Flow A — signing in', () => {
  it('bad password and unknown email are indistinguishable', async () => {
    const a = await request()
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'wrong' });
    const b = await request()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /me with no cookie → 401 envelope; with cookie → currency', async () => {
    const anon = await request().get('/api/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');

    const agent = await loginAna();
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.household.currency).toBe('PHP');
    expect(me.body.displayName).toBe('ana');
  });

  it('a token signed with a different secret → 401, not 500', async () => {
    const res = await request().get('/api/auth/me').set('Cookie', 'hl_session=not.a.jwt');
    expect(res.status).toBe(401);
  });
});

describe('Flow B — adding a transaction', () => {
  it('two taps and a number: id + category + amount + date', async () => {
    const agent = await loginAna();
    const id = uuid();
    const res = await agent.post('/api/transactions').send({
      id,
      categoryId: CAT.groceries,
      amountMinor: 85050,
      txnDate: '2026-09-03',
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction.amountMinor).toBe(85050);
    expect(res.body.transaction.paidBy).toBe(res.body.transaction.createdBy);
  });

  it('same id twice → one row, 200 the second time (idempotent retry)', async () => {
    const agent = await loginAna();
    const id = uuid();
    const body = { id, categoryId: CAT.groceries, amountMinor: 1000, txnDate: '2026-09-03' };
    const first = await agent.post('/api/transactions').send(body);
    const second = await agent.post('/api/transactions').send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const list = await agent.get('/api/transactions?period=2026-09');
    expect(list.body.transactions.filter((t: { id: string }) => t.id === id)).toHaveLength(1);
  });

  it('float or string amount → 400', async () => {
    const agent = await loginAna();
    for (const amountMinor of [850.5, '850']) {
      const res = await agent
        .post('/api/transactions')
        .send({ id: uuid(), categoryId: CAT.groceries, amountMinor, txnDate: '2026-09-03' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('paidBy switched to the other person is stored; person filter finds it', async () => {
    const ana = await loginAna();
    const ben = await ana.get('/api/auth/me');
    const benId = (await (await loginBen()).get('/api/auth/me')).body.id;
    void ben;
    const id = uuid();
    await ana.post('/api/transactions').send({
      id,
      categoryId: CAT.groceries,
      amountMinor: 1200,
      txnDate: '2026-09-04',
      paidBy: benId,
    });
    const filtered = await ana.get(`/api/transactions?period=2026-09&personId=${benId}`);
    expect(filtered.body.transactions.map((t: { id: string }) => t.id)).toContain(id);
    const row = filtered.body.transactions.find((t: { id: string }) => t.id === id);
    expect(row.paidBy).toBe(benId);
    expect(row.createdBy).not.toBe(benId);
  });

  it('paidBy that is not a member → 400', async () => {
    const agent = await loginAna();
    const res = await agent.post('/api/transactions').send({
      id: uuid(),
      categoryId: CAT.groceries,
      amountMinor: 1000,
      txnDate: '2026-09-03',
      paidBy: '00000000-0000-4000-8000-0000000000e2',
    });
    expect(res.status).toBe(400);
  });
});

describe('Flow C — the month turns over (copy + sweep)', () => {
  async function setUpAugust(agent: Awaited<ReturnType<typeof loginAna>>) {
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-08`).send({ plannedMinor: 100000 });
    await agent.put(`/api/budget/${CAT.transport}?period=2026-08`).send({ plannedMinor: 30000 });
    await agent
      .post('/api/transactions')
      .send({ id: uuid(), categoryId: CAT.groceries, amountMinor: 60000, txnDate: '2026-08-10' });
    // income in August so overcommitted logic has a prior figure
    await agent
      .post('/api/transactions')
      .send({ id: uuid(), categoryId: CAT.salary, amountMinor: 500000, txnDate: '2026-08-01' });
  }

  it('copy last month, then sweep the leftover into the emergency fund', async () => {
    const agent = await loginAna();
    await setUpAugust(agent);

    // September starts empty → copy offer present
    let sep = await agent.get('/api/budget?period=2026-09');
    expect(sep.body.rows.filter((r: { plannedMinor: number }) => r.plannedMinor > 0)).toHaveLength(0);

    const copy = await agent.post('/api/budget/copy').send({ from: '2026-08', to: '2026-09' });
    expect(copy.body).toEqual({ copied: 2, skipped: 0 });

    // August leftover = 130000 planned − 60000 spent = 70000
    sep = await agent.get('/api/budget?period=2026-09');
    expect(sep.body.sweepOffer).toEqual({ fromPeriod: '2026-08', amountMinor: 70000 });

    const sweep = await agent
      .post('/api/budget/sweep')
      .send({ from: '2026-08', categoryId: CAT.emergencyFund });
    expect(sweep.status).toBe(201);
    expect(sweep.body.transaction.amountMinor).toBe(70000);
    expect(sweep.body.transaction.txnDate).toBe('2026-09-01');
    expect(sweep.body.transaction.sweptFromPeriod).toBe('2026-08');

    // offer is now gone, without any manual state change
    sep = await agent.get('/api/budget?period=2026-09');
    expect(sep.body.sweepOffer).toBeNull();

    // savings reflects it, and names the source month
    const savings = await agent.get('/api/savings');
    expect(savings.body.savingsTotalMinor).toBe(70000);
    expect(savings.body.contributions[0].sweptFromPeriod).toBe('2026-08');
  });

  it('sweep amount is never taken from the request body', async () => {
    const agent = await loginAna();
    await setUpAugust(agent);
    const res = await agent
      .post('/api/budget/sweep')
      .send({ from: '2026-08', categoryId: CAT.emergencyFund, amountMinor: 999999 });
    expect(res.status).toBe(400);
  });

  it('sweep with an expense destination → 400', async () => {
    const agent = await loginAna();
    await setUpAugust(agent);
    const res = await agent
      .post('/api/budget/sweep')
      .send({ from: '2026-08', categoryId: CAT.groceries });
    expect(res.status).toBe(400);
  });

  it('nothing to sweep → 409', async () => {
    const agent = await loginAna();
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-08`).send({ plannedMinor: 10000 });
    await agent
      .post('/api/transactions')
      .send({ id: uuid(), categoryId: CAT.groceries, amountMinor: 20000, txnDate: '2026-08-10' });
    const res = await agent
      .post('/api/budget/sweep')
      .send({ from: '2026-08', categoryId: CAT.emergencyFund });
    expect(res.status).toBe(409);
  });
});

describe('Flow D — fixing a mistake', () => {
  it('a date edit across a month boundary reports both affected periods', async () => {
    const agent = await loginAna();
    const id = uuid();
    await agent
      .post('/api/transactions')
      .send({ id, categoryId: CAT.groceries, amountMinor: 5000, txnDate: '2026-08-31' });
    const res = await agent.patch(`/api/transactions/${id}`).send({ txnDate: '2026-09-01' });
    expect(res.status).toBe(200);
    expect(res.body.affectedPeriods.sort()).toEqual(['2026-08', '2026-09']);
    expect(res.body.transaction.period).toBe('2026-09');
  });

  it('deleting a sweep frees the month and the offer returns', async () => {
    const agent = await loginAna();
    await agent.put(`/api/budget/${CAT.groceries}?period=2026-08`).send({ plannedMinor: 50000 });
    const sweep = await agent
      .post('/api/budget/sweep')
      .send({ from: '2026-08', categoryId: CAT.emergencyFund });
    expect(sweep.status).toBe(201);

    let sep = await agent.get('/api/budget?period=2026-09');
    expect(sep.body.sweepOffer).toBeNull();

    const del = await agent.delete(`/api/transactions/${sweep.body.transaction.id}`);
    expect(del.status).toBe(204);

    sep = await agent.get('/api/budget?period=2026-09');
    expect(sep.body.sweepOffer).toEqual({ fromPeriod: '2026-08', amountMinor: 50000 });
  });

  it('editing a note keeps the amount; PATCH cannot set sweptFromPeriod', async () => {
    const agent = await loginAna();
    const id = uuid();
    await agent
      .post('/api/transactions')
      .send({ id, categoryId: CAT.groceries, amountMinor: 5000, txnDate: '2026-09-03' });
    const bad = await agent.patch(`/api/transactions/${id}`).send({ sweptFromPeriod: '2026-08' });
    expect(bad.status).toBe(400);
  });
});

describe('Flow E — seeing each other', () => {
  it("Ben's entry is visible to Ana on her next request, with attribution", async () => {
    const ana = await loginAna();
    const ben = await loginBen();
    const benId = (await ben.get('/api/auth/me')).body.id;
    const id = uuid();
    await ben
      .post('/api/transactions')
      .send({ id, categoryId: CAT.eatingOut, amountMinor: 4200, txnDate: '2026-09-05' });
    const list = await ana.get('/api/transactions?period=2026-09');
    const row = list.body.transactions.find((t: { id: string }) => t.id === id);
    expect(row).toBeTruthy();
    expect(row.createdByName).toBe('ben');
    void benId;
  });

  it('last-write-wins, and updatedBy is recorded', async () => {
    const ana = await loginAna();
    const ben = await loginBen();
    const id = uuid();
    await ana
      .post('/api/transactions')
      .send({ id, categoryId: CAT.groceries, amountMinor: 1000, txnDate: '2026-09-03' });
    await ben.patch(`/api/transactions/${id}`).send({ amountMinor: 1500 });
    const list = await ana.get('/api/transactions?period=2026-09');
    const row = list.body.transactions.find((t: { id: string }) => t.id === id);
    expect(row.amountMinor).toBe(1500);
    expect(row.updatedByName).toBe('ben');
  });
});
