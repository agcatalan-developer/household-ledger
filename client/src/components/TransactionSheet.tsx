import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMinor, minorToInput, parseAmount } from '../lib/money';
import { formatMonthLabel, localTimestamp, todayLocal } from '../lib/date';
import {
  invalidateForTransaction,
  keys,
  queryClient,
} from '../lib/queries';
import { useMe } from '../hooks/useAuth';
import type { Category, Transaction, TransactionsResponse } from '../lib/types';
import type { ToastState } from './Toast';

type SheetState =
  | { mode: 'add'; savingsOnly: boolean }
  | { mode: 'edit'; txn: Transaction };

export function TransactionSheet({
  state,
  autoFocusAmount,
  onClose,
  onToast,
}: {
  state: SheetState;
  autoFocusAmount: boolean;
  onClose: () => void;
  onToast: (t: ToastState) => void;
}) {
  const me = useMe();
  const currency = me.data?.household.currency ?? 'PHP';
  const myId = me.data?.id ?? '';
  const members = me.data?.household.members ?? [];

  const categoriesQuery = useQuery({
    queryKey: keys.categories,
    queryFn: () => api<{ categories: Category[] }>('/categories'),
  });
  const categories = categoriesQuery.data?.categories ?? [];

  const editing = state.mode === 'edit' ? state.txn : null;

  const [amountText, setAmountText] = useState(editing ? minorToInput(editing.amountMinor) : '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [txnDate, setTxnDate] = useState(editing?.txnDate ?? todayLocal());
  const [note, setNote] = useState(editing?.note ?? '');
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? myId);
  const [showMore, setShowMore] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<{ field: 'amount' | 'category'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (autoFocusAmount) amountRef.current?.focus();
  }, [autoFocusAmount]);

  useEffect(() => {
    if (paidBy === '' && myId) setPaidBy(myId);
  }, [myId, paidBy]);

  const savingsOnly = state.mode === 'add' && state.savingsOnly;

  const pickable = useMemo(
    () => categories.filter((c) => !c.archivedAt && (!savingsOnly || c.type === 'savings')),
    [categories, savingsOnly],
  );
  const recents = useMemo(() => {
    return [...pickable]
      .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
      .slice(0, 6);
  }, [pickable]);

  const shown = showMore ? pickable : recents;
  const selectedCat = categories.find((c) => c.id === categoryId) ?? null;
  const otherMember = members.find((m) => m.id !== myId);

  function optimisticRow(id: string, amountMinor: number): Transaction {
    const cat = categories.find((c) => c.id === categoryId)!;
    const meMember = members.find((m) => m.id === myId);
    const payer = members.find((m) => m.id === paidBy);
    return {
      id,
      categoryId,
      categoryName: cat?.name ?? '',
      categoryType: cat?.type ?? 'expense',
      amountMinor,
      txnDate,
      period: txnDate.slice(0, 7),
      note: note || null,
      sweptFromPeriod: null,
      paidBy,
      paidByName: payer?.displayName ?? '',
      createdBy: myId,
      createdByName: meMember?.displayName ?? '',
      updatedBy: null,
      updatedByName: null,
      createdAt: localTimestamp(),
      updatedAt: localTimestamp(),
    };
  }

  async function save() {
    setError(null);
    const amountMinor = parseAmount(amountText);
    if (!amountMinor) {
      setError({ field: 'amount', message: 'Enter an amount' });
      amountRef.current?.focus();
      return;
    }
    if (!categoryId) {
      setError({ field: 'category', message: 'Pick a category' });
      categoryRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setBusy(true);
    const isSavings = selectedCat?.type === 'savings';

    if (state.mode === 'edit') {
      try {
        const res = await api<{ transaction: Transaction; affectedPeriods: string[] }>(
          `/transactions/${editing!.id}`,
          {
            method: 'PATCH',
            body: {
              categoryId,
              amountMinor,
              txnDate,
              note: note || null,
              paidBy,
            },
          },
        );
        invalidateForTransaction({
          periods: res.affectedPeriods,
          isSavings: isSavings || res.transaction.categoryType === 'savings',
          sweptFromPeriod: editing!.sweptFromPeriod,
        });
        onClose();
        if (res.affectedPeriods.length > 1) {
          onToast({ message: `Moved to ${formatMonthLabel(res.transaction.period)}` });
        }
      } catch (err) {
        setBusy(false);
        setError({ field: 'amount', message: (err as Error).message });
      }
      return;
    }

    // ── add: optimistic insert, sheet closes immediately, toast with Undo ──
    const id = crypto.randomUUID();
    const period = txnDate.slice(0, 7);
    const row = optimisticRow(id, amountMinor);
    const listKey = ['transactions', period] as const;
    queryClient.setQueriesData<TransactionsResponse>({ queryKey: listKey }, (old) =>
      old ? { ...old, transactions: [row, ...old.transactions] } : old,
    );
    onClose();

    const body: Record<string, unknown> = { id, categoryId, amountMinor, txnDate, note: note || null };
    if (paidBy && paidBy !== myId) body.paidBy = paidBy;

    const post = api<{ transaction: Transaction }>('/transactions', { method: 'POST', body })
      .then((res) => {
        invalidateForTransaction({ periods: [period], isSavings });
        return res;
      })
      .catch((err) => {
        queryClient.setQueriesData<TransactionsResponse>({ queryKey: listKey }, (old) =>
          old ? { ...old, transactions: old.transactions.filter((t) => t.id !== id) } : old,
        );
        onToast({ message: 'Could not save that entry.' });
        throw err;
      });
    inFlight.current = post;

    onToast({
      message: `Added ${formatMinor(amountMinor, currency)}`,
      onUndo: async () => {
        try {
          await post; // wait for the POST so we never DELETE an id the server has not seen
          await api(`/transactions/${id}`, { method: 'DELETE' });
        } catch {
          /* POST failed outright — nothing on the server, just roll back the cache */
        }
        queryClient.setQueriesData<TransactionsResponse>({ queryKey: listKey }, (old) =>
          old ? { ...old, transactions: old.transactions.filter((t) => t.id !== id) } : old,
        );
        invalidateForTransaction({ periods: [period], isSavings });
      },
    });
  }

  async function remove() {
    if (!editing) return;
    const swept = editing.sweptFromPeriod;
    const label = `${formatMinor(editing.amountMinor, currency)} ${editing.categoryName}`;
    const msg = swept
      ? `This is the ${formatMinor(editing.amountMinor, currency)} swept from ${formatMonthLabel(swept)}. Deleting it will offer that sweep again.`
      : `Delete ${label}, ${editing.txnDate}?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await api(`/transactions/${editing.id}`, { method: 'DELETE' });
      invalidateForTransaction({
        periods: [editing.period],
        isSavings: editing.categoryType === 'savings',
        sweptFromPeriod: swept,
      });
      onClose();
    } catch (err) {
      setBusy(false);
      setError({ field: 'amount', message: (err as Error).message });
    }
  }

  // Editing inside a swept month warns before saving; it never blocks. The
  // target-month case (moving a row INTO a swept month) is warned in the
  // Transactions screen, which has sweptPeriods.
  const sweptWarning = Boolean(editing?.sweptFromPeriod);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{state.mode === 'edit' ? 'Edit transaction' : savingsOnly ? 'Add contribution' : 'Add transaction'}</h2>

        <input
          ref={amountRef}
          className="amount-input"
          inputMode="decimal"
          placeholder="0"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          aria-label="Amount"
        />
        {error?.field === 'amount' && <div className="inline-error">{error.message}</div>}

        <div className="chips" ref={categoryRef}>
          {shown.map((c) => (
            <button
              key={c.id}
              className={`chip${c.id === categoryId ? ' selected' : ''}`}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
          {!savingsOnly && pickable.length > recents.length && (
            <button className="chip" onClick={() => setShowMore((v) => !v)}>
              {showMore ? 'less' : 'more…'}
            </button>
          )}
        </div>
        {error?.field === 'category' && <div className="inline-error">{error.message}</div>}

        {sweptWarning && (
          <div className="banner">
            {formatMonthLabel(editing!.sweptFromPeriod!)} has been swept. Editing this won&apos;t
            change the amount already moved to savings.
          </div>
        )}

        <button className="btn ghost" onClick={() => setShowDetails((v) => !v)}>
          {showDetails ? 'Hide details' : 'Date · note · paid by'}
        </button>

        {showDetails && (
          <div>
            <label htmlFor="d">Date</label>
            <input id="d" type="text" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
            <label htmlFor="n">Note</label>
            <input id="n" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            {otherMember && (
              <>
                <label>Paid by</label>
                <div className="chips">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      className={`chip${m.id === paidBy ? ' selected' : ''}`}
                      onClick={() => setPaidBy(m.id)}
                    >
                      {m.id === myId ? 'You' : m.displayName}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn block" disabled={busy} onClick={save}>
            Save
          </button>
          {state.mode === 'edit' && (
            <button className="btn danger" disabled={busy} onClick={remove}>
              Delete
            </button>
          )}
        </div>
        <button className="btn ghost block" onClick={onClose} style={{ marginTop: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
