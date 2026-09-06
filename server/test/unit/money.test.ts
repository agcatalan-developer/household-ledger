import { describe, expect, it } from 'vitest';
import {
  monthView,
  savingsTotals,
  toMinor,
  type CategoryInput,
  type Minor,
  type MonthInput,
} from '../../src/money/index.js';

const m = (n: number) => n as Minor;

function cat(partial: Partial<CategoryInput> & Pick<CategoryInput, 'id' | 'type'>): CategoryInput {
  return {
    name: partial.id,
    sortOrder: 0,
    archivedAt: null,
    targetAmountMinor: null,
    ...partial,
  };
}

function input(over: Partial<MonthInput> = {}): MonthInput {
  return {
    period: '2026-08',
    categories: [],
    lines: [],
    spentByCategory: new Map(),
    priorIncome: m(0),
    alreadySwept: false,
    ...over,
  };
}

describe('toMinor — the string that arrives from SUM()', () => {
  it('parses an integer string', () => {
    expect(toMinor('400000')).toBe(400000);
  });
  it('accepts a number', () => {
    expect(toMinor(1234)).toBe(1234);
  });
  it('rejects a non-integer string', () => {
    expect(() => toMinor('4.5')).toThrow();
  });
  it('rejects an empty string', () => {
    expect(() => toMinor('')).toThrow();
    expect(() => toMinor('   ')).toThrow();
  });
  it('rejects NaN and floats', () => {
    expect(() => toMinor('abc')).toThrow();
    expect(() => toMinor(4.5)).toThrow();
  });
});

describe('monthView', () => {
  it('empty month → every total 0, no NaN, rows empty', () => {
    const v = monthView(input());
    expect(v.rows).toEqual([]);
    expect(v.leftToSpend).toBe(0);
    expect(v.unbudgeted).toBe(0);
    expect(v.savedThisMonth).toBe(0);
    expect(v.income).toBe(0);
    expect(v.sweepable).toBe(0);
    expect(v.overcommitted).toBe(false);
    expect(Number.isNaN(v.leftToSpend)).toBe(false);
  });

  it('category with spend, no line → planned 0, in unbudgeted and unbudgetedRows', () => {
    const v = monthView(
      input({
        categories: [cat({ id: 'food', type: 'expense' })],
        spentByCategory: new Map([['food', m(4000)]]),
      }),
    );
    expect(v.rows[0]).toMatchObject({ plannedMinor: 0, spentMinor: 4000, remainingMinor: -4000 });
    expect(v.unbudgeted).toBe(4000);
    expect(v.unbudgetedRows).toEqual([{ categoryId: 'food', name: 'food', spentMinor: 4000 }]);
  });

  it('category with line, no spend → spent 0, remaining = planned', () => {
    const v = monthView(
      input({
        categories: [cat({ id: 'rent', type: 'expense' })],
        lines: [{ categoryId: 'rent', plannedMinor: m(100000) }],
      }),
    );
    expect(v.rows[0]).toMatchObject({ spentMinor: 0, remainingMinor: 100000 });
    expect(v.unbudgeted).toBe(0);
    expect(v.unbudgetedRows).toEqual([]);
  });

  it('over budget → remaining negative', () => {
    const v = monthView(
      input({
        categories: [cat({ id: 'food', type: 'expense' })],
        lines: [{ categoryId: 'food', plannedMinor: m(1000) }],
        spentByCategory: new Map([['food', m(1500)]]),
      }),
    );
    expect(v.rows[0]!.remainingMinor).toBe(-500);
  });

  it('§5 worked example — Food over, Transport under → leftToSpend −1000, sweepable 0', () => {
    const v = monthView(
      input({
        categories: [
          cat({ id: 'food', type: 'expense', sortOrder: 1 }),
          cat({ id: 'transport', type: 'expense', sortOrder: 2 }),
        ],
        lines: [
          { categoryId: 'food', plannedMinor: m(1_000_000) },
          { categoryId: 'transport', plannedMinor: m(800_000) },
        ],
        spentByCategory: new Map([
          ['food', m(1_400_000)],
          ['transport', m(500_000)],
        ]),
      }),
    );
    expect(v.leftToSpend).toBe(-100_000);
    expect(v.sweepable).toBe(0);
  });

  it('income transactions → excluded from unbudgeted, leftToSpend, and rows', () => {
    const v = monthView(
      input({
        categories: [
          cat({ id: 'salary', type: 'income' }),
          cat({ id: 'food', type: 'expense' }),
        ],
        lines: [{ categoryId: 'food', plannedMinor: m(1000) }],
        spentByCategory: new Map([
          ['salary', m(500000)],
          ['food', m(200)],
        ]),
      }),
    );
    expect(v.rows.map((r) => r.categoryId)).toEqual(['food']);
    expect(v.income).toBe(500000);
    expect(v.unbudgeted).toBe(0);
    expect(v.leftToSpend).toBe(800);
  });

  it('savings transactions → in savedThisMonth, not in leftToSpend', () => {
    const v = monthView(
      input({
        categories: [
          cat({ id: 'ef', type: 'savings' }),
          cat({ id: 'food', type: 'expense' }),
        ],
        lines: [{ categoryId: 'food', plannedMinor: m(1000) }],
        spentByCategory: new Map([
          ['ef', m(3000)],
          ['food', m(400)],
        ]),
      }),
    );
    expect(v.savedThisMonth).toBe(3000);
    expect(v.leftToSpend).toBe(600);
  });

  it('month already swept, leftToSpend still positive → sweepable 0', () => {
    const v = monthView(
      input({
        alreadySwept: true,
        categories: [cat({ id: 'food', type: 'expense' })],
        lines: [{ categoryId: 'food', plannedMinor: m(1000) }],
        spentByCategory: new Map([['food', m(100)]]),
      }),
    );
    expect(v.leftToSpend).toBe(900);
    expect(v.sweepable).toBe(0);
  });

  it('priorIncome 0, plan exceeds it → overcommitted false', () => {
    const v = monthView(
      input({
        priorIncome: m(0),
        categories: [cat({ id: 'food', type: 'expense' })],
        lines: [{ categoryId: 'food', plannedMinor: m(999999) }],
      }),
    );
    expect(v.overcommitted).toBe(false);
  });

  it('priorIncome > 0, plan exceeds it → overcommitted true', () => {
    const v = monthView(
      input({
        priorIncome: m(100000),
        categories: [
          cat({ id: 'food', type: 'expense' }),
          cat({ id: 'ef', type: 'savings' }),
        ],
        lines: [
          { categoryId: 'food', plannedMinor: m(90000) },
          { categoryId: 'ef', plannedMinor: m(20000) },
        ],
      }),
    );
    expect(v.overcommitted).toBe(true);
  });

  it('priorIncome > 0, plan within it → overcommitted false', () => {
    const v = monthView(
      input({
        priorIncome: m(100000),
        categories: [cat({ id: 'food', type: 'expense' })],
        lines: [{ categoryId: 'food', plannedMinor: m(50000) }],
      }),
    );
    expect(v.overcommitted).toBe(false);
  });

  it('archived category with spend this month → present in rows; unbudgeted only if no line', () => {
    const withLine = monthView(
      input({
        categories: [
          cat({ id: 'old', type: 'expense', archivedAt: '2026-09-01 00:00:00' }),
        ],
        lines: [{ categoryId: 'old', plannedMinor: m(1000) }],
        spentByCategory: new Map([['old', m(500)]]),
      }),
    );
    expect(withLine.rows.map((r) => r.categoryId)).toEqual(['old']);
    expect(withLine.unbudgeted).toBe(0);

    const noLine = monthView(
      input({
        categories: [
          cat({ id: 'old', type: 'expense', archivedAt: '2026-09-01 00:00:00' }),
        ],
        spentByCategory: new Map([['old', m(500)]]),
      }),
    );
    expect(noLine.unbudgeted).toBe(500);
    expect(noLine.unbudgetedRows).toEqual([{ categoryId: 'old', name: 'old', spentMinor: 500 }]);
  });

  it('rows come back in sort_order; unbudgetedRows worst (largest spend) first', () => {
    const v = monthView(
      input({
        categories: [
          cat({ id: 'b', type: 'expense', sortOrder: 20 }),
          cat({ id: 'a', type: 'expense', sortOrder: 10 }),
          cat({ id: 'c', type: 'expense', sortOrder: 30 }),
        ],
        spentByCategory: new Map([
          ['a', m(100)],
          ['b', m(900)],
          ['c', m(500)],
        ]),
      }),
    );
    expect(v.rows.map((r) => r.categoryId)).toEqual(['a', 'b', 'c']);
    expect(v.unbudgetedRows.map((r) => r.categoryId)).toEqual(['b', 'c', 'a']);
    expect(v.unbudgeted).toBe(1500);
  });

  it('Σ unbudgetedRows === unbudgeted', () => {
    const v = monthView(
      input({
        categories: [
          cat({ id: 'x', type: 'expense' }),
          cat({ id: 'y', type: 'expense' }),
        ],
        spentByCategory: new Map([
          ['x', m(333)],
          ['y', m(667)],
        ]),
      }),
    );
    const sum = v.unbudgetedRows.reduce((a, r) => a + r.spentMinor, 0);
    expect(sum).toBe(v.unbudgeted);
  });
});

describe('savingsTotals', () => {
  it('Σ per-goal === total, archived goals included; reached flag', () => {
    const t = savingsTotals([
      { categoryId: 'ef', name: 'Emergency', targetAmountMinor: m(50000), archivedAt: null, savedMinor: m(12000) },
      { categoryId: 'car', name: 'Car', targetAmountMinor: m(10000), archivedAt: null, savedMinor: m(13000) },
      { categoryId: 'old', name: 'Old', targetAmountMinor: null, archivedAt: '2026-01-01 00:00:00', savedMinor: m(8000) },
    ]);
    expect(t.totalMinor).toBe(33000);
    expect(t.goals.find((g) => g.categoryId === 'ef')!.reached).toBe(false);
    expect(t.goals.find((g) => g.categoryId === 'car')!.reached).toBe(true);
    expect(t.goals.find((g) => g.categoryId === 'old')!.reached).toBe(false);
  });

  it('empty → total 0', () => {
    expect(savingsTotals([]).totalMinor).toBe(0);
  });
});
