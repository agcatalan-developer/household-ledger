import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMinor } from '../lib/money';
import { formatDayLabel, formatMonthLabel } from '../lib/date';
import { keys } from '../lib/queries';
import { useMonth } from '../hooks/useMonth';
import { useCurrency } from '../hooks/useAuth';
import { MonthSelector } from '../components/MonthSelector';
import { useSheet } from '../components/Shell';
import type { Category, Transaction, TransactionsResponse } from '../lib/types';

export function TransactionsScreen() {
  const { month } = useMonth();
  const currency = useCurrency();
  const { openEdit } = useSheet();

  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState('');
  const [personId, setPersonId] = useState('');

  const filters: Record<string, string> = {};
  if (categoryId) filters.categoryId = categoryId;
  if (type) filters.type = type;
  if (personId) filters.personId = personId;

  const qs = new URLSearchParams({ period: month, ...filters }).toString();
  const q = useQuery({
    queryKey: keys.transactions(month, filters),
    queryFn: () => api<TransactionsResponse>(`/transactions?${qs}`),
  });
  const cats = useQuery({ queryKey: keys.categories, queryFn: () => api<{ categories: Category[] }>('/categories') });

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of q.data?.transactions ?? []) {
      const list = map.get(t.txnDate) ?? [];
      list.push(t);
      map.set(t.txnDate, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [q.data]);

  const hasFilters = Boolean(categoryId || type || personId);
  const members = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of q.data?.transactions ?? []) seen.set(t.paidBy, t.paidByName);
    return [...seen.entries()];
  }, [q.data]);

  return (
    <div className="screen">
      <MonthSelector />

      <div className="filters">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {(cats.data?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="savings">Savings</option>
        </select>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Anyone</option>
          {members.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {q.data && q.data.transactions.length === 0 && (
        <div className="card empty">
          <p>{hasFilters ? 'Nothing matches those filters.' : `Nothing in ${formatMonthLabel(month)} yet.`}</p>
          {hasFilters && (
            <button
              className="btn secondary"
              onClick={() => {
                setCategoryId('');
                setType('');
                setPersonId('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {groups.map(([date, rows]) => (
        <div key={date} className="card">
          <div className="day-divider">{formatDayLabel(date)}</div>
          {rows.map((t) => (
            <button
              key={t.id}
              className="row"
              style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
              onClick={() => openEdit(t)}
            >
              <span>
                <span className="primary">{t.categoryName}</span>
                {t.note && <span className="secondary"> · {t.note}</span>}
                <div className="attribution">
                  paid by {t.paidByName}
                  {t.paidBy !== t.createdBy && ` · added by ${t.createdByName}`}
                  {t.updatedByName && ` · edited by ${t.updatedByName}`}
                  {t.sweptFromPeriod && (
                    <span className="badge">swept from {formatMonthLabel(t.sweptFromPeriod)}</span>
                  )}
                </div>
              </span>
              <span className="amount">{formatMinor(t.amountMinor, currency)}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
