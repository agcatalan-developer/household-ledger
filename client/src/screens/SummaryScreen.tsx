import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatMinor, formatMinorUnsigned } from '../lib/money';
import { formatMonthLabel } from '../lib/date';
import { keys } from '../lib/queries';
import { useMonth } from '../hooks/useMonth';
import { useCurrency } from '../hooks/useAuth';
import { MonthSelector } from '../components/MonthSelector';
import { BudgetBar } from '../components/BudgetBar';
import { useSheet } from '../components/Shell';
import type { SummaryResponse } from '../lib/types';

export function SummaryScreen() {
  const { month } = useMonth();
  const currency = useCurrency();
  const { openEdit } = useSheet();

  const q = useQuery({
    queryKey: keys.summary(month),
    queryFn: () => api<SummaryResponse>(`/summary?period=${month}`),
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="screen">
        <MonthSelector />
        <div className="card skeleton" style={{ height: 160 }} />
        <div className="card skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  const s = q.data;
  const bars = s.budgetRows.filter((r) => r.plannedMinor > 0).slice(0, 5);
  const nothingHere = s.budgetRows.length === 0 && s.recentEntries.length === 0;
  const over = s.leftToSpendMinor < 0;

  return (
    <div className="screen">
      <MonthSelector />

      {nothingHere ? (
        <div className="card empty">
          <p>Nothing in {formatMonthLabel(month)} yet.</p>
          <Link className="btn" to={`/budget?m=${month}`}>
            Copy last month&apos;s budget
          </Link>
        </div>
      ) : (
        <>
          <div className="card headline">
            <div className={`amount${over ? ' over' : ''}`}>
              {over
                ? formatMinorUnsigned(s.leftToSpendMinor, currency)
                : formatMinor(s.leftToSpendMinor, currency)}
            </div>
            <div className="label">{over ? 'over budget' : 'left to spend'}</div>
            {s.unbudgetedMinor > 0 && (
              <Link className="sub" to={`/budget?m=${month}`}>
                {formatMinor(s.unbudgetedMinor, currency)} spent outside your budget →
              </Link>
            )}
          </div>

          {bars.length > 0 && (
            <div className="card">
              <h2>Budget</h2>
              {bars.map((r) => (
                <BudgetBar key={r.categoryId} row={r} currency={currency} />
              ))}
              {s.budgetRows.filter((r) => r.plannedMinor > 0).length > 5 && (
                <Link className="btn ghost" to={`/budget?m=${month}`} style={{ marginTop: 8 }}>
                  See all
                </Link>
              )}
            </div>
          )}

          <div className="card">
            <h2>Savings</h2>
            <div className="row">
              <span className="primary">{formatMinor(s.savedThisMonthMinor, currency)} this month</span>
              <span className="secondary">{formatMinor(s.savingsTotalMinor, currency)} total</span>
            </div>
          </div>

          <div className="card">
            <h2>Recent</h2>
            {s.recentEntries.length === 0 && <div className="secondary">No entries yet.</div>}
            {s.recentEntries.map((t) => (
              <button
                key={t.id}
                className="row"
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
                onClick={() => openEdit(t)}
              >
                <span>
                  <span className="primary">{t.categoryName}</span>
                  <div className="secondary">
                    paid by {t.paidByName}
                    {t.paidBy !== t.createdBy && ` · added by ${t.createdByName}`}
                  </div>
                </span>
                <span className="amount">{formatMinor(t.amountMinor, currency)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
