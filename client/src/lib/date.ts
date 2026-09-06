// Current day/month from the CLIENT clock, formatted from getFullYear/getMonth/
// getDate. The UTC date serialiser is banned by lint and by a gate: it would
// file a 00:30 entry on the 1st into the previous month (Phase 6).

export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function thisMonthLocal(): string {
  return todayLocal().slice(0, 7);
}

/** A local wall-clock timestamp, "YYYY-MM-DD HH:MM:SS" — for optimistic rows,
 *  from local getters, never the UTC serialiser (Phase 6). */
export function localTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatMonthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[m - 1]} ${y}`;
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const zero = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(zero / 12);
  const nm = (zero % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
