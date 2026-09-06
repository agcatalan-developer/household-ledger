// server/src/money — §5's arithmetic, and the only place it lives.
// Pure: imports nothing from db/, does no I/O. Names carry no `Minor` suffix
// because every value in here is `Minor` by type; Phase 5 adds the suffix at
// serialisation. Ordering is not this module's job — rows come back in sort_order.
import { type Minor, ZERO, addMinor, subMinor, sumMinor } from './minor.js';

export { type Minor, toMinor, ZERO } from './minor.js';

export type CategoryType = 'expense' | 'income' | 'savings';

export interface CategoryInput {
  id: string;
  name: string;
  type: CategoryType;
  sortOrder: number;
  archivedAt: string | null;
  targetAmountMinor: Minor | null;
}

export interface BudgetLineInput {
  categoryId: string;
  plannedMinor: Minor;
}

export interface MonthInput {
  period: string;
  /** Every category with a line OR activity this month, archived included. */
  categories: CategoryInput[];
  lines: BudgetLineInput[];
  /** categoryId -> Σ amount this month. One GROUP BY in the repository. */
  spentByCategory: Map<string, Minor>;
  /** income(p−1), for overcommitted. */
  priorIncome: Minor;
  /** Is there a transaction with swept_from_period = period? */
  alreadySwept: boolean;
}

export interface MonthRow {
  categoryId: string;
  name: string;
  type: 'expense' | 'savings';
  plannedMinor: Minor;
  spentMinor: Minor;
  remainingMinor: Minor;
}

export interface UnbudgetedRow {
  categoryId: string;
  name: string;
  spentMinor: Minor;
}

export interface MonthView {
  period: string;
  rows: MonthRow[];
  unbudgeted: Minor;
  unbudgetedRows: UnbudgetedRow[];
  leftToSpend: Minor;
  savedThisMonth: Minor;
  income: Minor;
  sweepable: Minor;
  overcommitted: boolean;
}

const planned = (lines: Map<string, Minor>, categoryId: string): Minor =>
  lines.get(categoryId) ?? ZERO;

const spent = (spentByCategory: Map<string, Minor>, categoryId: string): Minor =>
  spentByCategory.get(categoryId) ?? ZERO;

/**
 * Σ planned(expense) − Σ spent(expense), signed. Expense only (Phase 0):
 * savings is planned beside expenses but excluded from the headline so the
 * sweep has a real leftover to move. Unbudgeted spending drags this down on
 * its own, because planned is 0 there.
 */
function leftToSpend(input: MonthInput, lineMap: Map<string, Minor>): Minor {
  // The input contract (Phase 4): `categories` holds every category with a line
  // OR activity this month, so every expense line's category is present here.
  let totalPlanned = ZERO;
  let totalSpent = ZERO;
  for (const c of input.categories) {
    if (c.type !== 'expense') continue;
    totalPlanned = addMinor(totalPlanned, planned(lineMap, c.id));
    totalSpent = addMinor(totalSpent, spent(input.spentByCategory, c.id));
  }
  return subMinor(totalPlanned, totalSpent);
}

export function monthView(input: MonthInput): MonthView {
  const lineMap = new Map<string, Minor>(input.lines.map((l) => [l.categoryId, l.plannedMinor]));

  const budgetable = input.categories
    .filter((c) => c.type === 'expense' || c.type === 'savings')
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const rows: MonthRow[] = budgetable.map((c) => {
    const p = planned(lineMap, c.id);
    const s = spent(input.spentByCategory, c.id);
    return {
      categoryId: c.id,
      name: c.name,
      type: c.type as 'expense' | 'savings',
      plannedMinor: p,
      spentMinor: s,
      remainingMinor: subMinor(p, s),
    };
  });

  const unbudgetedRows: UnbudgetedRow[] = input.categories
    .filter((c) => c.type === 'expense' && !lineMap.has(c.id))
    .map((c) => ({ categoryId: c.id, name: c.name, spentMinor: spent(input.spentByCategory, c.id) }))
    .filter((r) => r.spentMinor > 0)
    .sort((a, b) => b.spentMinor - a.spentMinor);

  const unbudgeted = sumMinor(unbudgetedRows.map((r) => r.spentMinor));

  const savedThisMonth = sumMinor(
    input.categories
      .filter((c) => c.type === 'savings')
      .map((c) => spent(input.spentByCategory, c.id)),
  );

  const income = sumMinor(
    input.categories
      .filter((c) => c.type === 'income')
      .map((c) => spent(input.spentByCategory, c.id)),
  );

  const lts = leftToSpend(input, lineMap);
  // sweepable calls leftToSpend — one rule, two uses. Not a re-derivation.
  const sweepable = input.alreadySwept ? ZERO : (Math.max(0, lts) as Minor);

  const plannedExpenseAndSavings = sumMinor(
    input.categories
      .filter((c) => c.type === 'expense' || c.type === 'savings')
      .map((c) => planned(lineMap, c.id)),
  );
  const overcommitted = input.priorIncome > 0 && plannedExpenseAndSavings > input.priorIncome;

  return {
    period: input.period,
    rows,
    unbudgeted,
    unbudgetedRows,
    leftToSpend: lts,
    savedThisMonth,
    income,
    sweepable,
    overcommitted,
  };
}

// ── Savings, which is all-time and therefore its own function ───────────────

export interface SavingsGoalInput {
  categoryId: string;
  name: string;
  targetAmountMinor: Minor | null;
  archivedAt: string | null;
  savedMinor: Minor;
}

export interface SavingsGoalView extends SavingsGoalInput {
  reached: boolean;
}

export interface SavingsTotals {
  totalMinor: Minor;
  goals: SavingsGoalView[];
}

/**
 * The total and the per-goal breakdown together, so §10 (goals listed beneath
 * the total) and §8 (total alone) cannot come to disagree. Archived goals with
 * a balance are included — the total must equal what is listed.
 */
export function savingsTotals(goals: SavingsGoalInput[]): SavingsTotals {
  const view: SavingsGoalView[] = goals.map((g) => ({
    ...g,
    reached: g.targetAmountMinor !== null && g.savedMinor >= g.targetAmountMinor,
  }));
  return { totalMinor: sumMinor(view.map((g) => g.savedMinor)), goals: view };
}
