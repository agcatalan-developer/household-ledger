import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fillPercent } from '../lib/bar';
import { formatMinor, minorToInput, parseAmount } from '../lib/money';
import { formatMonthLabel } from '../lib/date';
import { invalidateEverything, keys } from '../lib/queries';
import { useCurrency } from '../hooks/useAuth';
import { useSheet } from '../components/Shell';
import type { SavingsResponse } from '../lib/types';

export function SavingsScreen() {
  const currency = useCurrency();
  const { openAdd } = useSheet();
  const [showArchived, setShowArchived] = useState(false);

  const q = useQuery({ queryKey: keys.savings, queryFn: () => api<SavingsResponse>('/savings') });

  if (!q.data) {
    return (
      <div className="screen">
        <h1>Savings</h1>
        <div className="card skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  const active = q.data.goals.filter((g) => !g.archived);
  const archived = q.data.goals.filter((g) => g.archived);

  async function setTarget(categoryId: string, current: number | null) {
    const input = window.prompt(
      'Target amount (leave blank to clear):',
      current ? minorToInput(current) : '',
    );
    if (input === null) return;
    const targetAmountMinor = input.trim() === '' ? null : parseAmount(input);
    if (input.trim() !== '' && !targetAmountMinor) return;
    await api(`/categories/${categoryId}`, { method: 'PATCH', body: { targetAmountMinor } });
    invalidateEverything();
  }

  return (
    <div className="screen">
      <h1>Savings</h1>

      <div className="card headline">
        <div className="amount">{formatMinor(q.data.savingsTotalMinor, currency)}</div>
        <div className="label">total saved</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => openAdd({ savingsOnly: true })}>
          Add contribution
        </button>
      </div>

      <div className="card">
        <h2>Goals</h2>
        {active.map((g) => (
          <GoalRow key={g.categoryId} goal={g} currency={currency} onSetTarget={setTarget} />
        ))}
        {active.length === 0 && <div className="secondary">No goals yet.</div>}
      </div>

      {archived.length > 0 && (
        <div className="card">
          <button className="btn ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived &&
            archived.map((g) => (
              <GoalRow key={g.categoryId} goal={g} currency={currency} onSetTarget={setTarget} />
            ))}
        </div>
      )}

      <div className="card">
        <h2>Recent contributions</h2>
        {q.data.contributions.map((t) => (
          <div key={t.id} className="row">
            <span>
              <span className="primary">{t.categoryName}</span>
              {t.sweptFromPeriod && (
                <div className="attribution">
                  <span className="badge">swept from {formatMonthLabel(t.sweptFromPeriod)}</span>
                </div>
              )}
            </span>
            <span className="amount">{formatMinor(t.amountMinor, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalRow({
  goal,
  currency,
  onSetTarget,
}: {
  goal: SavingsResponse['goals'][number];
  currency: string;
  onSetTarget: (id: string, current: number | null) => void;
}) {
  const pct =
    goal.targetAmountMinor && goal.targetAmountMinor > 0
      ? fillPercent(goal.savedMinor, goal.targetAmountMinor)
      : null;
  return (
    <div className="bar-row">
      <div className="bar-top">
        <span>{goal.name}</span>
        <span>
          {goal.targetAmountMinor
            ? `${formatMinor(goal.savedMinor, currency)} of ${formatMinor(goal.targetAmountMinor, currency)}`
            : `${formatMinor(goal.savedMinor, currency)} saved`}
          {goal.reached && <span className="badge">Reached</span>}
        </span>
      </div>
      {pct !== null && (
        <div className="track">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <button
        className="btn ghost"
        style={{ padding: '4px 0', fontSize: 12 }}
        onClick={() => onSetTarget(goal.categoryId, goal.targetAmountMinor)}
      >
        {goal.targetAmountMinor ? 'Change target' : 'Set a target'}
      </button>
    </div>
  );
}
