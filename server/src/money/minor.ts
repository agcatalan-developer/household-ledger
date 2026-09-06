// Money is an integer in minor units. Signed, because remaining and leftToSpend
// go negative. Positivity is a storage rule (Zod + CHECK), never a type rule.
export type Minor = number & { readonly __minor: unique symbol };

export const ZERO = 0 as Minor;

/**
 * The one door the type system does not watch: mysql2 hands DECIMAL (from SUM())
 * back as a string, and "400000" + "300000" === "400000300000" with nothing thrown.
 * Every aggregate crosses into the money module through here.
 */
export function toMinor(value: string | number): Minor {
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error('toMinor: empty string');
  }
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(n)) {
    throw new Error(`toMinor: not an integer: ${JSON.stringify(value)}`);
  }
  return n as Minor;
}

export function addMinor(a: Minor, b: Minor): Minor {
  return (a + b) as Minor;
}

export function subMinor(a: Minor, b: Minor): Minor {
  return (a - b) as Minor;
}

export function sumMinor(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const v of values) total += v;
  return total as Minor;
}
