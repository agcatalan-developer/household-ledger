import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMinor, formatMinorUnsigned, minorToInput, parseAmount } from '../lib/money';
import { formatMonthLabel, shiftPeriod } from '../lib/date';
import {
  invalidateForBudget,
  invalidateForCopy,
  invalidateForSweep,
  keys,
} from '../lib/queries';
import { useMonth } from '../hooks/useMonth';
import { useCurrency } from '../hooks/useAuth';
import { MonthSelector } from '../components/MonthSelector';
import { useSheet } from '../components/Shell';
import type { BudgetResponse, Category } from '../lib/types';

export function BudgetScreen() {
  const { month } = useMonth();
  const currency = useCurrency();
  const { toast } = useSheet();
  const [expandUnbudgeted, setExpandUnbudgeted] = useState(false);
  const [dismissedOvercommit, setDismissedOvercommit] = useState('');

  const q = useQuery({
    queryKey: keys.budget(month),
    queryFn: () => api<BudgetResponse>(`/budget?period=${month}`),
  });
  const cats = useQuery({
    queryKey: keys.categories,
    queryFn: () => api<{ categories: Category[] }>('/categories'),
  });

  async function putLine(categoryId: string, text: string, previous: number) {
    const trimmed = text.trim();
    const minor = trimmed === '' ? 0 : parseAmount(trimmed);
    if (trimmed !== '' && minor === null) return; // rejected, leave as-is
    const value = minor ?? 0;
    if (value === previous) return;
    await api(`/budget/${categoryId}?period=${month}`, { method: 'PUT', body: { plannedMinor: value } });
    invalidateForBudget(month);
    if (value === 0 && previous > 0) {
      toast({
        message: 'Budget removed',
        onUndo: async () => {
          await api(`/budget/${categoryId}?period=${month}`, {
            method: 'PUT',
            body: { plannedMinor: previous },
          });
          invalidateForBudget(month);
        },
      });
    }
  }

  async function copyLastMonth() {
    const from = shiftPeriod(month, -1);
    const res = await api<{ copied: number; skipped: number }>('/budget/copy', {
      method: 'POST',
      body: { from, to: month },
    });
    invalidateForCopy(month);
    toast({
      message:
        res.skipped > 0
          ? `Copied ${res.copied} categories, skipped ${res.skipped} already set.`
          : `Copied ${res.copied} categories.`,
    });
  }

  async function doSweep(fromPeriod: string, amountMinor: number) {
    const savingsCats = (cats.data?.categories ?? []).filter(
      (c) => c.type === 'savings' && !c.archivedAt,
    );
    let categoryId = savingsCats[0]?.id;
    if (savingsCats.length > 1) {
      const name = window.prompt(
        `Sweep into which goal?\n${savingsCats.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`,
        '1',
      );
      if (name === null) return;
      categoryId = savingsCats[Number(name) - 1]?.id ?? savingsCats[0]?.id;
    }
    if (!categoryId) return;
    const destName = savingsCats.find((c) => c.id === categoryId)?.name ?? 'savings';
    const ok = window.confirm(
      `Move ${formatMinor(amountMinor, currency)} left over from ${formatMonthLabel(
        fromPeriod,
      )} into ${destName}, dated 1 ${formatMonthLabel(shiftPeriod(fromPeriod, 1)).split(' ')[0]}.`,
    );
    if (!ok) return;
    await api('/budget/sweep', { method: 'POST', body: { from: fromPeriod, categoryId } });
    invalidateForSweep(fromPeriod);
    toast({ message: `Swept ${formatMinor(amountMinor, currency)} to ${destName}` });
  }

  if (!q.data) {
    return (
      <div className="screen">
        <MonthSelector />
        <div className="card skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  const b = q.data;
  const hasLines = b.rows.some((r) => r.plannedMinor > 0);
  const prevPeriod = shiftPeriod(month, -1);

  return (
    <div className="screen">
      <MonthSelector />

      {b.overcommitted && dismissedOvercommit !== month && (
        <div className="banner">
          <span>You&apos;ve planned more than last month&apos;s income.</span>
          <button onClick={() => setDismissedOvercommit(month)}>Dismiss</button>
        </div>
      )}

      {b.sweepOffer && (
        <div className="card">
          <h2>Sweep</h2>
          <p style={{ margin: '0 0 12px' }}>
            {formatMinor(b.sweepOffer.amountMinor, currency)} left over from{' '}
            {formatMonthLabel(b.sweepOffer.fromPeriod)}.
          </p>
          <button
            className="btn"
            onClick={() => doSweep(b.sweepOffer!.fromPeriod, b.sweepOffer!.amountMinor)}
          >
            Sweep to savings
          </button>
        </div>
      )}

      {!hasLines ? (
        <div className="card empty">
          <p>No budget for {formatMonthLabel(month)} yet.</p>
          <button className="btn" onClick={copyLastMonth}>
            Copy {formatMonthLabel(prevPeriod)}&apos;s budget
          </button>
        </div>
      ) : null}

      <div className="card">
        <h2>Categories</h2>
        {b.rows.map((r) => (
          <div key={r.categoryId} className="row">
            <span className="primary" style={{ flex: 1 }}>
              {r.name}
              <div className="secondary">
                spent {formatMinor(r.spentMinor, currency)} ·{' '}
                {r.remainingMinor < 0
                  ? `over by ${formatMinorUnsigned(r.remainingMinor, currency)}`
                  : `${formatMinor(r.remainingMinor, currency)} left`}
              </div>
            </span>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={r.plannedMinor ? minorToInput(r.plannedMinor) : ''}
              placeholder="—"
              style={{ width: 90, textAlign: 'right' }}
              onBlur={(e) => putLine(r.categoryId, e.target.value, r.plannedMinor)}
            />
          </div>
        ))}
      </div>

      {b.unbudgetedMinor > 0 && (
        <div className="card">
          <button
            className="row"
            style={{ width: '100%', background: 'none', border: 'none' }}
            onClick={() => setExpandUnbudgeted((v) => !v)}
          >
            <span className="primary">Unbudgeted spending</span>
            <span className="amount">
              {formatMinor(b.unbudgetedMinor, currency)} {expandUnbudgeted ? '▾' : '▸'}
            </span>
          </button>
          {expandUnbudgeted &&
            b.unbudgetedRows.map((u) => (
              <div key={u.categoryId} className="row">
                <span>{u.name}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="amount">{formatMinor(u.spentMinor, currency)}</span>
                  <button
                    className="btn secondary"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={async () => {
                      await api(`/budget/${u.categoryId}?period=${month}`, {
                        method: 'PUT',
                        body: { plannedMinor: u.spentMinor },
                      });
                      invalidateForBudget(month);
                    }}
                  >
                    give this a budget
                  </button>
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
