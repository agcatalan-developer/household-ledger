import { Router } from 'express';
import { z } from 'zod';
import { withHousehold } from '../db/withHousehold.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { IsoDate, Minor, Period, Uuid, assertNoServerOwned } from '../validation.js';
import type { Minor as MinorT } from '../money/index.js';

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const ListQuery = z
  .object({
    period: Period,
    categoryId: Uuid.optional(),
    type: z.enum(['expense', 'income', 'savings']).optional(),
    personId: Uuid.optional(),
  })
  .strict();

const Note = z.string().max(255).nullable().optional();

const CreateBody = z
  .object({
    id: Uuid,
    categoryId: Uuid,
    amountMinor: Minor,
    txnDate: IsoDate,
    note: Note,
    paidBy: Uuid.optional(),
  })
  .strict();

const PatchBody = z
  .object({
    categoryId: Uuid.optional(),
    amountMinor: Minor.optional(),
    txnDate: IsoDate.optional(),
    note: Note,
    paidBy: Uuid.optional(),
  })
  .strict();

transactionsRouter.get('/', async (req, res, next) => {
  try {
    const q = ListQuery.parse(req.query);
    const { period, ...filters } = q;
    const result = await withHousehold(req.ctx!, async (r) => {
      const [transactions, sweptPeriods] = await Promise.all([
        r.transactions.byPeriod(period, filters),
        r.transactions.sweptPeriods(),
      ]);
      return { transactions, sweptPeriods };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

transactionsRouter.post('/', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const body = CreateBody.parse(req.body);
    const ctx = req.ctx!;
    const { row, created } = await withHousehold(ctx, async (r) => {
      const paidBy = body.paidBy ?? ctx.userId;
      if (!(await r.household.isMember(paidBy))) {
        throw new AppError('VALIDATION_FAILED', 'paidBy must be a member of this household');
      }
      return r.transactions.insert(
        {
          id: body.id,
          categoryId: body.categoryId,
          amountMinor: body.amountMinor as MinorT,
          txnDate: body.txnDate,
          note: body.note ?? null,
          paidBy,
        },
        ctx.userId,
      );
    });
    res.status(created ? 201 : 200).json({ transaction: row });
  } catch (err) {
    next(err);
  }
});

transactionsRouter.patch('/:id', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const patch = PatchBody.parse(req.body);
    const ctx = req.ctx!;
    const result = await withHousehold(ctx, async (r) => {
      const existing = await r.transactions.byId(req.params.id);
      if (!existing) throw new AppError('NOT_FOUND', 'Not found');
      if (patch.paidBy && !(await r.household.isMember(patch.paidBy))) {
        throw new AppError('VALIDATION_FAILED', 'paidBy must be a member of this household');
      }
      await r.transactions.update(
        req.params.id,
        {
          ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
          ...(patch.amountMinor !== undefined ? { amountMinor: patch.amountMinor as MinorT } : {}),
          ...(patch.txnDate !== undefined ? { txnDate: patch.txnDate } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          ...(patch.paidBy !== undefined ? { paidBy: patch.paidBy } : {}),
        },
        ctx.userId,
      );
      const updated = await r.transactions.byId(req.params.id);
      const periods = new Set<string>([existing.period]);
      if (updated) periods.add(updated.period);
      return { transaction: updated, affectedPeriods: [...periods].sort() };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

transactionsRouter.delete('/:id', async (req, res, next) => {
  try {
    const ctx = req.ctx!;
    await withHousehold(ctx, async (r) => {
      const existing = await r.transactions.byId(req.params.id);
      if (!existing) throw new AppError('NOT_FOUND', 'Not found');
      await r.transactions.remove(req.params.id);
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
