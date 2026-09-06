// Progress-bar geometry only. A ratio for pixels is not money (Phase 8) — but it
// is kept out of components so the "no arithmetic in a screen" rule stays clean,
// and out of money.ts so that file's single job (minor ↔ string) is unambiguous.

/** spent / planned as an integer 0–100, capped — a bar cannot draw past its end. */
export function fillPercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}
