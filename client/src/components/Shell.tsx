import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import type { Transaction } from '../lib/types';
import { TransactionSheet } from './TransactionSheet';
import { Toast, type ToastState } from './Toast';

interface SheetApi {
  openAdd: (opts?: { savingsOnly?: boolean }) => void;
  openEdit: (txn: Transaction) => void;
  toast: (t: ToastState) => void;
}

const SheetContext = createContext<SheetApi | null>(null);
export const useSheet = (): SheetApi => {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useSheet outside Shell');
  return ctx;
};

const TABS = [
  { to: '/summary', label: 'Summary', dot: '◎' },
  { to: '/transactions', label: 'Transactions', dot: '≣' },
  { to: '/budget', label: 'Budget', dot: '▤' },
  { to: '/savings', label: 'Savings', dot: '◈' },
];

export function Shell({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const month = params.get('m');
  const carry = month ? `?m=${month}` : '';

  const [sheet, setSheet] = useState<
    { mode: 'add'; savingsOnly: boolean } | { mode: 'edit'; txn: Transaction } | null
  >(null);
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const focusOnOpen = useRef(false);

  const openAdd = useCallback((opts?: { savingsOnly?: boolean }) => {
    focusOnOpen.current = true;
    setSheet({ mode: 'add', savingsOnly: opts?.savingsOnly ?? false });
  }, []);
  const openEdit = useCallback((txn: Transaction) => setSheet({ mode: 'edit', txn }), []);
  const toast = useCallback((t: ToastState) => setToastState(t), []);

  return (
    <SheetContext.Provider value={{ openAdd, openEdit, toast }}>
      <div className="app">
        <header className="app-header">
          <span>Household Ledger</span>
          <NavLink to={`/settings${carry}`} aria-label="Settings" className="avatar">
            ☰
          </NavLink>
        </header>
        {children}

        <button
          className="fab"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => openAdd()}
          aria-label="Add transaction"
        >
          + Add
        </button>

        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={`${t.to}${carry}`}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <span className="dot" aria-hidden>
                {t.dot}
              </span>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {sheet && (
        <TransactionSheet
          key={sheet.mode === 'edit' ? sheet.txn.id : 'add'}
          state={sheet}
          autoFocusAmount={focusOnOpen.current}
          onClose={() => setSheet(null)}
          onToast={toast}
        />
      )}
      {toastState && <Toast state={toastState} onDone={() => setToastState(null)} />}
    </SheetContext.Provider>
  );
}
