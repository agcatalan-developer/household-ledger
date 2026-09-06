import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { withHousehold } from '../db/withHousehold.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { Period, Uuid, assertNoServerOwned } from '../validation.js';
import { loadMonthView } from '../services/monthData.js';
import { prevPeriod, firstOfNextMonth } from '../services/period.js';
import type { Minor } from '../money/index.js';

export const budgetRouter = Router();
budgetRouter.use(requireAuth);

const PeriodQuery = z.object({ period: Period }).strict();

budgetRouter.get('/', async (req, res, next) => {
  try {
    const { period } = PeriodQuery.parse(req.query);
    const payload = await withHousehold(req.ctx!, async (r) => {
      const { view } = await loadMonthView(r, period, { includeAllActive: true });
      const prev = prevPeriod(period);
      const { view: prevView } = await loadMonthView(r, prev);
      const sweepOffer =
        prevView.sweepable > 0
          ? { fromPeriod: prev, amountMinor: prevView.sweepable }
          : null;
      return {
        period,
        rows: view.rows.map((row) => ({
          categoryId: row.categoryId,
          name: row.name,
          type: row.type,
          plannedMinor: row.plannedMinor,
          spentMinor: row.spentMinor,
          remainingMinor: row.remainingMinor,
        })),
        unbudgetedRows: view.unbudgetedRows,
        unbudgetedMinor: view.unbudgeted,
        overcommitted: view.overcommitted,
        sweepOffer,
      };
    });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

const PutBody = z
  .object({ plannedMinor: z.number().int().nonnegative() })
  .strict();

budgetRouter.put('/:categoryId', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const categoryId = Uuid.parse(req.params.categoryId);
    const { period } = PeriodQuery.parse(req.query);
    const { plannedMinor } = PutBody.parse(req.body);

    const result = await withHousehold(req.ctx!, async (r) => {
      const category = await r.categories.byId(categoryId);
      if (!category) throw new AppError('NOT_FOUND', 'Not found');
      if (category.type === 'income') {
        throw new AppError('VALIDATION_FAILED', 'Income categories are not budgeted');
      }
      if (plannedMinor === 0) {
        await r.budget.remove(period, categoryId);
        return { deleted: true as const };
      }
      await r.budget.upsert(period, categoryId, category.type, plannedMinor as Minor);
      const lines = await r.budget.byPeriod(period);
      const line = lines.find((l) => l.categoryId === categoryId);
      return { deleted: false as const, line };
    });

    if (result.deleted) {
      res.status(204).end();
      return;
    }
    res.json({ line: result.line });
  } catch (err) {
    next(err);
  }
});

const CopyBody = z.object({ from: Period, to: Period }).strict();

budgetRouter.post('/copy', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const { from, to } = CopyBody.parse(req.body);
    const result = await withHousehold(req.ctx!, (r) =>
      r.tx(async (txr) => {
        const [fromLines, toLines, categories] = await Promise.all([
          txr.budget.byPeriod(from),
          txr.budget.byPeriod(to),
          txr.categories.all(),
        ]);
        const existing = new Set(toLines.map((l) => l.categoryId));
        const archived = new Set(categories.filter((c) => c.archivedAt).map((c) => c.id));
        let copied = 0;
        let skipped = 0;
        for (const line of fromLines) {
          if (existing.has(line.categoryId) || archived.has(line.categoryId)) {
            skipped += 1;
            continue;
          }
          await txr.budget.upsert(to, line.categoryId, line.categoryType, line.plannedMinor);
          copied += 1;
        }
        return { copied, skipped };
      }),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const SweepBody = z.object({ from: Period, categoryId: Uuid }).strict();

budgetRouter.post('/sweep', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const { from, categoryId } = SweepBody.parse(req.body);
    const ctx = req.ctx!;
    const transaction = await withHousehold(ctx, async (r) => {
      const category = await r.categories.byId(categoryId);
      if (!category || category.type !== 'savings' || category.archivedAt) {
        throw new AppError('VALIDATION_FAILED', 'Sweep destination must be an active savings goal');
      }
      const { view } = await loadMonthView(r, from);
      if (view.sweepable <= 0) {
        throw new AppError('CONFLICT', 'Nothing to sweep for that month');
      }
      const { row } = await r.transactions.insert(
        {
          id: randomUUID(),
          categoryId,
          amountMinor: view.sweepable,
          txnDate: firstOfNextMonth(from),
          note: null,
          paidBy: ctx.userId,
          sweptFromPeriod: from,
        },
        ctx.userId,
      );
      return row;
    });
    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
});
