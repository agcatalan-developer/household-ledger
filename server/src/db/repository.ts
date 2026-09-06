import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';
import { toMinor, type Minor } from '../money/index.js';
import type {
  BudgetLineRecord,
  CategoryRecord,
  CategoryType,
  HouseholdRecord,
  MemberRecord,
  NewTransaction,
  TransactionPatch,
  TransactionRecord,
} from './types.js';

type Queryer = Pick<Pool | PoolConnection, 'query'>;

const TXN_SELECT = `
  SELECT t.id, t.category_id AS categoryId, c.name AS categoryName, c.type AS categoryType,
         t.amount_minor AS amountMinor, t.txn_date AS txnDate, t.period,
         t.note, t.swept_from_period AS sweptFromPeriod,
         t.paid_by AS paidBy, pu.display_name AS paidByName,
         t.created_by AS createdBy, cu.display_name AS createdByName,
         t.updated_by AS updatedBy, uu.display_name AS updatedByName,
         t.created_at AS createdAt, t.updated_at AS updatedAt
  FROM transactions t
  JOIN categories c ON c.household_id = t.household_id AND c.id = t.category_id
  JOIN users pu ON pu.id = t.paid_by
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users uu ON uu.id = t.updated_by
`;

function mapTxn(r: RowDataPacket): TransactionRecord {
  return {
    id: r.id,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categoryType: r.categoryType,
    amountMinor: toMinor(r.amountMinor),
    txnDate: r.txnDate,
    period: r.period,
    note: r.note,
    sweptFromPeriod: r.sweptFromPeriod,
    paidBy: r.paidBy,
    paidByName: r.paidByName,
    createdBy: r.createdBy,
    createdByName: r.createdByName,
    updatedBy: r.updatedBy,
    updatedByName: r.updatedByName,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface TransactionFilters {
  categoryId?: string | undefined;
  type?: CategoryType | undefined;
  personId?: string | undefined;
}

export function makeRepository(q: Queryer, householdId: string) {
  const hid = householdId;

  const transactions = {
    async byPeriod(period: string, filters: TransactionFilters = {}): Promise<TransactionRecord[]> {
      const where: string[] = ['t.household_id = ?', 't.period = ?'];
      const params: unknown[] = [hid, period];
      if (filters.categoryId) {
        where.push('t.category_id = ?');
        params.push(filters.categoryId);
      }
      if (filters.type) {
        where.push('c.type = ?');
        params.push(filters.type);
      }
      if (filters.personId) {
        where.push('t.paid_by = ?');
        params.push(filters.personId);
      }
      const [rows] = await q.query<RowDataPacket[]>(
        `${TXN_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.txn_date DESC, t.created_at DESC`,
        params,
      );
      return rows.map(mapTxn);
    },

    async byId(id: string): Promise<TransactionRecord | null> {
      const [rows] = await q.query<RowDataPacket[]>(
        `${TXN_SELECT} WHERE t.household_id = ? AND t.id = ?`,
        [hid, id],
      );
      return rows[0] ? mapTxn(rows[0]) : null;
    },

    async recent(limit: number): Promise<TransactionRecord[]> {
      const [rows] = await q.query<RowDataPacket[]>(
        `${TXN_SELECT} WHERE t.household_id = ? ORDER BY t.txn_date DESC, t.created_at DESC LIMIT ?`,
        [hid, limit],
      );
      return rows.map(mapTxn);
    },

    async recentSavings(limit: number): Promise<TransactionRecord[]> {
      const [rows] = await q.query<RowDataPacket[]>(
        `${TXN_SELECT} WHERE t.household_id = ? AND c.type = 'savings'
         ORDER BY t.txn_date DESC, t.created_at DESC LIMIT ?`,
        [hid, limit],
      );
      return rows.map(mapTxn);
    },

    /** categoryId -> Σ amount_minor for the period. One GROUP BY. */
    async spentByCategory(period: string): Promise<Map<string, Minor>> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT category_id AS categoryId, SUM(amount_minor) AS total
         FROM transactions WHERE household_id = ? AND period = ? GROUP BY category_id`,
        [hid, period],
      );
      const map = new Map<string, Minor>();
      for (const r of rows) map.set(r.categoryId, toMinor(r.total));
      return map;
    },

    /** All-time Σ per savings category, for savingsTotals(). */
    async savedByCategory(): Promise<Map<string, Minor>> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT t.category_id AS categoryId, SUM(t.amount_minor) AS total
         FROM transactions t
         JOIN categories c ON c.household_id = t.household_id AND c.id = t.category_id
         WHERE t.household_id = ? AND c.type = 'savings'
         GROUP BY t.category_id`,
        [hid],
      );
      const map = new Map<string, Minor>();
      for (const r of rows) map.set(r.categoryId, toMinor(r.total));
      return map;
    },

    async incomeForPeriod(period: string): Promise<Minor> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(t.amount_minor), 0) AS total
         FROM transactions t
         JOIN categories c ON c.household_id = t.household_id AND c.id = t.category_id
         WHERE t.household_id = ? AND t.period = ? AND c.type = 'income'`,
        [hid, period],
      );
      return toMinor(rows[0]?.total ?? 0);
    },

    async isPeriodSwept(period: string): Promise<boolean> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT 1 FROM transactions WHERE household_id = ? AND swept_from_period = ? LIMIT 1`,
        [hid, period],
      );
      return rows.length > 0;
    },

    async sweptPeriods(): Promise<string[]> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT DISTINCT swept_from_period AS p FROM transactions
         WHERE household_id = ? AND swept_from_period IS NOT NULL ORDER BY p`,
        [hid],
      );
      return rows.map((r) => r.p as string);
    },

    /**
     * Client-supplied id. A repeat with the same id that is visible in this
     * household returns the existing row (idempotent retry). A duplicate id not
     * visible here is a collision — surfaced as ER_DUP_ENTRY → 409.
     */
    async insert(t: NewTransaction, createdBy: string): Promise<{ row: TransactionRecord; created: boolean }> {
      const existing = await this.byId(t.id);
      if (existing) return { row: existing, created: false };
      await q.query<ResultSetHeader>(
        `INSERT INTO transactions
           (id, household_id, category_id, amount_minor, txn_date, note, swept_from_period, paid_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          hid,
          t.categoryId,
          t.amountMinor,
          t.txnDate,
          t.note,
          t.sweptFromPeriod ?? null,
          t.paidBy,
          createdBy,
        ],
      );
      const row = await this.byId(t.id);
      if (!row) throw new Error('insert: row vanished');
      return { row, created: true };
    },

    async update(id: string, patch: TransactionPatch, updatedBy: string): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.categoryId !== undefined) {
        sets.push('category_id = ?');
        params.push(patch.categoryId);
      }
      if (patch.amountMinor !== undefined) {
        sets.push('amount_minor = ?');
        params.push(patch.amountMinor);
      }
      if (patch.txnDate !== undefined) {
        sets.push('txn_date = ?');
        params.push(patch.txnDate);
      }
      if (patch.note !== undefined) {
        sets.push('note = ?');
        params.push(patch.note);
      }
      if (patch.paidBy !== undefined) {
        sets.push('paid_by = ?');
        params.push(patch.paidBy);
      }
      sets.push('updated_by = ?');
      params.push(updatedBy);
      params.push(hid, id);
      await q.query<ResultSetHeader>(
        `UPDATE transactions SET ${sets.join(', ')} WHERE household_id = ? AND id = ?`,
        params,
      );
    },

    async remove(id: string): Promise<void> {
      await q.query<ResultSetHeader>(`DELETE FROM transactions WHERE household_id = ? AND id = ?`, [
        hid,
        id,
      ]);
    },
  };

  const categories = {
    async all(): Promise<CategoryRecord[]> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT c.id, c.name, c.type, c.target_amount_minor AS targetAmountMinor,
                c.sort_order AS sortOrder, c.archived_at AS archivedAt,
                MAX(t.txn_date) AS lastUsedAt
         FROM categories c
         LEFT JOIN transactions t ON t.household_id = c.household_id AND t.category_id = c.id
         WHERE c.household_id = ?
         GROUP BY c.id
         ORDER BY c.sort_order`,
        [hid],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        targetAmountMinor: r.targetAmountMinor === null ? null : toMinor(r.targetAmountMinor),
        sortOrder: r.sortOrder,
        archivedAt: r.archivedAt,
        lastUsedAt: r.lastUsedAt,
      }));
    },

    async byId(id: string): Promise<CategoryRecord | null> {
      const all = await this.all();
      return all.find((c) => c.id === id) ?? null;
    },

    async insert(input: {
      name: string;
      type: CategoryType;
      targetAmountMinor: Minor | null;
      sortOrder: number;
    }): Promise<string> {
      const id = randomUUID();
      await q.query<ResultSetHeader>(
        `INSERT INTO categories (id, household_id, name, type, target_amount_minor, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, hid, input.name, input.type, input.targetAmountMinor, input.sortOrder],
      );
      return id;
    },

    async update(
      id: string,
      patch: { name?: string; targetAmountMinor?: Minor | null; archivedAt?: string | null },
    ): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.name !== undefined) {
        sets.push('name = ?');
        params.push(patch.name);
      }
      if (patch.targetAmountMinor !== undefined) {
        sets.push('target_amount_minor = ?');
        params.push(patch.targetAmountMinor);
      }
      if (patch.archivedAt !== undefined) {
        sets.push('archived_at = ?');
        params.push(patch.archivedAt);
      }
      if (sets.length === 0) return;
      params.push(hid, id);
      await q.query<ResultSetHeader>(
        `UPDATE categories SET ${sets.join(', ')} WHERE household_id = ? AND id = ?`,
        params,
      );
    },

    async reorder(list: { id: string; sortOrder: number }[]): Promise<void> {
      for (const item of list) {
        await q.query<ResultSetHeader>(
          `UPDATE categories SET sort_order = ? WHERE household_id = ? AND id = ?`,
          [item.sortOrder, hid, item.id],
        );
      }
    },

    async maxSortOrder(): Promise<number> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories WHERE household_id = ?`,
        [hid],
      );
      return Number(rows[0]?.m ?? 0);
    },
  };

  const budget = {
    async byPeriod(period: string): Promise<BudgetLineRecord[]> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT id, category_id AS categoryId, category_type AS categoryType, period,
                planned_minor AS plannedMinor
         FROM budget_lines WHERE household_id = ? AND period = ?`,
        [hid, period],
      );
      return rows.map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        categoryType: r.categoryType,
        period: r.period,
        plannedMinor: toMinor(r.plannedMinor),
      }));
    },

    async upsert(
      period: string,
      categoryId: string,
      categoryType: CategoryType,
      plannedMinor: Minor,
    ): Promise<void> {
      await q.query<ResultSetHeader>(
        `INSERT INTO budget_lines (id, household_id, category_id, category_type, period, planned_minor)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE planned_minor = VALUES(planned_minor)`,
        [randomUUID(), hid, categoryId, categoryType, period, plannedMinor],
      );
    },

    async remove(period: string, categoryId: string): Promise<number> {
      const [res] = await q.query<ResultSetHeader>(
        `DELETE FROM budget_lines WHERE household_id = ? AND period = ? AND category_id = ?`,
        [hid, period, categoryId],
      );
      return res.affectedRows;
    },
  };

  const household = {
    async get(): Promise<HouseholdRecord> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT id, name, currency FROM households WHERE id = ?`,
        [hid],
      );
      const r = rows[0];
      if (!r) throw new Error('household missing');
      return { id: r.id, name: r.name, currency: r.currency };
    },
    async update(patch: { name?: string | undefined; currency?: string | undefined }): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.name !== undefined) {
        sets.push('name = ?');
        params.push(patch.name);
      }
      if (patch.currency !== undefined) {
        sets.push('currency = ?');
        params.push(patch.currency);
      }
      if (sets.length === 0) return;
      params.push(hid);
      await q.query<ResultSetHeader>(`UPDATE households SET ${sets.join(', ')} WHERE id = ?`, params);
    },
    async members(): Promise<MemberRecord[]> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT hm.user_id AS userId, u.display_name AS displayName, u.email, hm.role
         FROM household_members hm JOIN users u ON u.id = hm.user_id
         WHERE hm.household_id = ? ORDER BY hm.role, u.display_name`,
        [hid],
      );
      return rows.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        email: r.email,
        role: r.role,
      }));
    },
    async isMember(userId: string): Promise<boolean> {
      const [rows] = await q.query<RowDataPacket[]>(
        `SELECT 1 FROM household_members WHERE household_id = ? AND user_id = ? LIMIT 1`,
        [hid, userId],
      );
      return rows.length > 0;
    },
  };

  return { transactions, categories, budget, household };
}

export type Repository = ReturnType<typeof makeRepository>;
