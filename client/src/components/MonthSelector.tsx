import { formatMonthLabel } from '../lib/date';
import { useMonth } from '../hooks/useMonth';

export function MonthSelector() {
  const { month, step } = useMonth();
  return (
    <div className="month-bar">
      <button onClick={() => step(-1)} aria-label="Previous month">
        ‹
      </button>
      <strong>{formatMonthLabel(month)}</strong>
      <button onClick={() => step(1)} aria-label="Next month">
        ›
      </button>
    </div>
  );
}
