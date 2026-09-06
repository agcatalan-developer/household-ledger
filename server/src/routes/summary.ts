import { Router } from 'express';
import { z } from 'zod';
import { withHousehold } from '../db/withHousehold.js';
import { requireAuth } from '../middleware/auth.js';
import { Period } from '../validation.js';
import { loadMonthView, loadSavingsTotals } from '../services/monthData.js';
import { worstFirst } from '../services/ordering.js';

export const summaryRouter = Router();
summaryRouter.use(requireAuth);

const Query = z.object({ period: Period }).strict();

summaryRouter.get('/', async (req, res, next) => {
  try {
    const { period } = Query.parse(req.query);
    const payload = await withHousehold(req.ctx!, async (r) => {
      const [{ view }, savings, recent, sweptPeriods] = await Promise.all([
        loadMonthView(r, period),
        loadSavingsTotals(r),
        r.transactions.recent(5),
        r.transactions.sweptPeriods(),
      ]);
      return {
        period,
        leftToSpendMinor: view.leftToSpend,
        unbudgetedMinor: view.unbudgeted,
        unbudgetedRows: view.unbudgetedRows.map((u) => ({
          categoryId: u.categoryId,
          name: u.name,
          spentMinor: u.spentMinor,
        })),
        savedThisMonthMinor: view.savedThisMonth,
        savingsTotalMinor: savings.totalMinor,
        overcommitted: view.overcommitted,
        budgetRows: worstFirst(view.rows).map((row) => ({
          categoryId: row.categoryId,
          name: row.name,
          type: row.type,
          plannedMinor: row.plannedMinor,
          spentMinor: row.spentMinor,
          remainingMinor: row.remainingMinor,
        })),
        recentEntries: recent,
        sweptPeriods,
      };
    });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});
