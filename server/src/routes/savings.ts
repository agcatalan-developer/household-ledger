import { Router } from 'express';
import { withHousehold } from '../db/withHousehold.js';
import { requireAuth } from '../middleware/auth.js';
import { loadSavingsTotals } from '../services/monthData.js';

export const savingsRouter = Router();
savingsRouter.use(requireAuth);

savingsRouter.get('/', async (req, res, next) => {
  try {
    const payload = await withHousehold(req.ctx!, async (r) => {
      const [totals, contributions] = await Promise.all([
        loadSavingsTotals(r),
        r.transactions.recentSavings(20),
      ]);
      return {
        savingsTotalMinor: totals.totalMinor,
        goals: totals.goals.map((g) => ({
          categoryId: g.categoryId,
          name: g.name,
          savedMinor: g.savedMinor,
          targetAmountMinor: g.targetAmountMinor,
          reached: g.reached,
          archived: g.archivedAt !== null,
        })),
        contributions,
      };
    });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});
