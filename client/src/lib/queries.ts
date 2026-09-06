import { QueryClient } from '@tanstack/react-query';

// Keys namespaced by period so a month can be invalidated precisely (Phase 6).
export const keys = {
  me: ['me'] as const,
  categories: ['categories'] as const,
  savings: ['savings'] as const,
  summary: (period: string) => ['summary', period] as const,
  budget: (period: string) => ['budget', period] as const,
  transactions: (period: string, filters: Record<string, string> = {}) =>
    ['transactions', period, filters] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 10_000,
      retry: 1,
    },
  },
});

/**
 * The written invalidation map (Phase 6). Getting this wrong is how two people
 * see different numbers. `affectedPeriods` on an edit can be one or two months.
 */
export function invalidateForTransaction(opts: {
  periods: string[];
  isSavings: boolean;
  sweptFromPeriod?: string | null;
}): void {
  const touch = (p: string) => {
    queryClient.invalidateQueries({ queryKey: keys.summary(p) });
    queryClient.invalidateQueries({ queryKey: keys.budget(p) });
    queryClient.invalidateQueries({ queryKey: ['transactions', p] });
  };
  for (const p of opts.periods) touch(p);

  if (opts.sweptFromPeriod) {
    // A sweep touches the source month too: it leaves sweptPeriods and its offer returns.
    touch(opts.sweptFromPeriod);
  }
  if (opts.isSavings || opts.sweptFromPeriod) {
    queryClient.invalidateQueries({ queryKey: keys.savings });
    // savingsTotalMinor is all-time — every cached summary is now stale.
    queryClient.invalidateQueries({ queryKey: ['summary'] });
  }
}

export function invalidateForBudget(period: string): void {
  queryClient.invalidateQueries({ queryKey: keys.summary(period) });
  queryClient.invalidateQueries({ queryKey: keys.budget(period) });
}

export function invalidateForCopy(to: string): void {
  invalidateForBudget(to);
}

export function invalidateForSweep(fromPeriod: string): void {
  const [y, mo] = fromPeriod.split('-').map(Number) as [number, number];
  const zero = y * 12 + (mo - 1) + 1;
  const next = `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, '0')}`;

  invalidateForBudget(fromPeriod);
  queryClient.invalidateQueries({ queryKey: keys.summary(next) });
  queryClient.invalidateQueries({ queryKey: keys.budget(next) });
  queryClient.invalidateQueries({ queryKey: ['transactions', next] });
  queryClient.invalidateQueries({ queryKey: keys.savings });
  queryClient.invalidateQueries({ queryKey: ['summary'] });
}

/** Any settings mutation invalidates everything (Phase 12) — names are in every payload. */
export function invalidateEverything(): void {
  queryClient.invalidateQueries();
}
