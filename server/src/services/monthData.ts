import {
  monthView,
  savingsTotals,
  ZERO,
  type MonthInput,
  type MonthView,
  type SavingsTotals,
} from '../money/index.js';
import type { ScopedRepository } from '../db/withHousehold.js';
import type { CategoryRecord } from '../db/types.js';
import { prevPeriod } from './period.js';

/**
 * Assembles the plain rows the money module needs for one month and calls it.
 * `includeAllActive` widens the category set to every non-archived expense/
 * savings category (the Budget screen shows a row per category even with no
 * line and no spend); the minimum set — line OR activity, archived included —
 * is what §8 and §4 require.
 */
export async function loadMonthView(
  repo: ScopedRepository,
  period: string,
  opts: { includeAllActive?: boolean } = {},
): Promise<{ view: MonthView; categories: CategoryRecord[] }> {
  const [allCategories, lines, spentByCategory, priorIncome, alreadySwept] = await Promise.all([
    repo.categories.all(),
    repo.budget.byPeriod(period),
    repo.transactions.spentByCategory(period),
    repo.transactions.incomeForPeriod(prevPeriod(period)),
    repo.transactions.isPeriodSwept(period),
  ]);

  const lineIds = new Set(lines.map((l) => l.categoryId));
  const relevant = allCategories.filter((c) => {
    const hasLineOrActivity = lineIds.has(c.id) || spentByCategory.has(c.id);
    if (hasLineOrActivity) return true;
    if (opts.includeAllActive && !c.archivedAt && c.type !== 'income') return true;
    return false;
  });

  const input: MonthInput = {
    period,
    categories: relevant.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      sortOrder: c.sortOrder,
      archivedAt: c.archivedAt,
      targetAmountMinor: c.targetAmountMinor,
    })),
    lines: lines.map((l) => ({ categoryId: l.categoryId, plannedMinor: l.plannedMinor })),
    spentByCategory,
    priorIncome,
    alreadySwept,
  };

  return { view: monthView(input), categories: allCategories };
}

export async function loadSavingsTotals(repo: ScopedRepository): Promise<SavingsTotals> {
  const [categories, savedByCategory] = await Promise.all([
    repo.categories.all(),
    repo.transactions.savedByCategory(),
  ]);
  const goals = categories
    .filter((c) => c.type === 'savings')
    .filter((c) => !c.archivedAt || (savedByCategory.get(c.id) ?? 0) > 0)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      targetAmountMinor: c.targetAmountMinor,
      archivedAt: c.archivedAt,
      savedMinor: savedByCategory.get(c.id) ?? ZERO,
    }));
  return savingsTotals(goals);
}
