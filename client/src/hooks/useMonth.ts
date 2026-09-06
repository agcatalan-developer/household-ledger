import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { shiftPeriod, thisMonthLocal } from '../lib/date';

const VALID = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The selected month lives in the URL as ?m=YYYY-MM — one source of truth,
 *  shared by Summary, Transactions and Budget; a refresh keeps it, back steps
 *  through months (Phase 6). */
export function useMonth(): {
  month: string;
  setMonth: (m: string) => void;
  step: (delta: number) => void;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get('m');
  const month = raw && VALID.test(raw) ? raw : thisMonthLocal();

  const setMonth = useCallback(
    (m: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('m', m);
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const step = useCallback((delta: number) => setMonth(shiftPeriod(month, delta)), [month, setMonth]);

  return { month, setMonth, step };
}
