/** Period arithmetic — string-only, no Date, no timezone. */
export function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** The 1st of the month after `period`, as YYYY-MM-DD. */
export function firstOfNextMonth(period: string): string {
  return `${nextPeriod(period)}-01`;
}
