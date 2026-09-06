import type { MonthRow } from '../money/index.js';

/**
 * Worst-first (Phase 5): `remaining` ascending, so the most over-budget row
 * leads; ties broken by larger `spent`. Defined here once so no screen invents
 * its own ordering.
 */
export function worstFirst(rows: MonthRow[]): MonthRow[] {
  return rows
    .slice()
    .sort((a, b) => a.remainingMinor - b.remainingMinor || b.spentMinor - a.spentMinor);
}
