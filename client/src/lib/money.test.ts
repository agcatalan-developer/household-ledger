import { describe, expect, it } from 'vitest';
import { formatMinor, parseAmount } from './money';

describe('parseAmount — string work only, never parseFloat', () => {
  it.each([
    ['850', 85000],
    ['850.5', 85050],
    ['850.50', 85050],
    ['0.01', 1],
    ['1,234.56', 123456],
    ['  42 ', 4200],
  ])('%s → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', '850.505', 'abc', '-5', '0', '0.00', '1.2.3', '.5'])('rejects %s', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('formatMinor — the only division by 100', () => {
  it('round-trips against parseAmount', () => {
    for (const major of ['850', '850.50', '1234.56', '0.01']) {
      const minor = parseAmount(major)!;
      const formatted = formatMinor(minor, 'PHP');
      // strip currency symbol and grouping, keep the number
      const back = parseAmount(formatted.replace(/[^\d.]/g, ''));
      expect(back).toBe(minor);
    }
  });

  it('always two decimals, signed', () => {
    expect(formatMinor(85000, 'PHP')).toMatch(/850\.00/);
    expect(formatMinor(-100000, 'PHP')).toMatch(/^-/);
  });
});
