import { fillPercent } from '../lib/bar';
import { formatMinor, formatMinorUnsigned } from '../lib/money';
import type { BudgetRow } from '../lib/types';

/** Fill is spent / planned, capped at 100% — a bar cannot draw past its end.
 *  Over-budget is carried by colour and words, not geometry (Phase 8). */
export function BudgetBar({ row, currency }: { row: BudgetRow; currency: string }) {
  const over = row.remainingMinor < 0;
  const pct = fillPercent(row.spentMinor, row.plannedMinor);
  return (
    <div className="bar-row">
      <div className="bar-top">
        <span>{row.name}</span>
        <span className={over ? 'over' : undefined}>
          {over
            ? `over by ${formatMinorUnsigned(row.remainingMinor, currency)}`
            : `${formatMinor(row.remainingMinor, currency)} left`}
        </span>
      </div>
      <div className="track">
        <div className={`fill${over ? ' over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
