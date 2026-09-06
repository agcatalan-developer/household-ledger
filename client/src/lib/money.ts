// The single place minor units become a string, and the ONLY division by 100 in
// the entire client (Phase 6). Nothing else here sums, divides, or compares money.

export function formatMinor(minor: number, currency: string): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const major = Math.trunc(abs / 100);
  const cents = abs % 100;
  const asNumber = Number(`${major}.${String(cents).padStart(2, '0')}`);
  const body = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber);
  return negative ? `-${body}` : body;
}

/** Strip the sign for headline copy like "₱1,000 over budget". */
export function formatMinorUnsigned(minor: number, currency: string): string {
  return formatMinor(Math.abs(minor), currency);
}

/** Minor units → the plain major-unit string an editable field starts from
 *  ("85050" → "850.50"). The inverse of parseAmount; the only other place minor
 *  units are divided, and it lives here for the same reason formatMinor does. */
export function minorToInput(minor: number): string {
  const abs = Math.abs(minor);
  const major = Math.trunc(abs / 100);
  const cents = abs % 100;
  return cents ? `${major}.${String(cents).padStart(2, '0')}` : String(major);
}

/**
 * Major-unit text → integer minor units, string work only. Never `parseFloat`,
 * never `* 100` — `8.51 * 100` is `850.999…` (Phase 7).
 *
 *   "850"     -> 85000
 *   "850.5"   -> 85050
 *   "850.50"  -> 85050
 *   "850.505" -> null (more than two decimals)
 */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const cents = (frac + '00').slice(0, 2);
  const minor = parseInt(whole + cents, 10);
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return minor;
}
