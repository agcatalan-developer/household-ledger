import type { Minor } from '../money/index.js';

export interface Ctx {
  userId: string;
  householdId: string;
}

export type CategoryType = 'expense' | 'income' | 'savings';

export interface TransactionRecord {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryType: CategoryType;
  amountMinor: Minor;
  txnDate: string;
  period: string;
  note: string | null;
  sweptFromPeriod: string | null;
  paidBy: string;
  paidByName: string;
  createdBy: string;
  createdByName: string;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  type: CategoryType;
  targetAmountMinor: Minor | null;
  sortOrder: number;
  archivedAt: string | null;
  lastUsedAt: string | null;
}

export interface BudgetLineRecord {
  id: string;
  categoryId: string;
  categoryType: CategoryType;
  period: string;
  plannedMinor: Minor;
}

export interface HouseholdRecord {
  id: string;
  name: string;
  currency: string;
}

export interface MemberRecord {
  userId: string;
  displayName: string;
  email: string;
  role: 'owner' | 'member';
}

export interface NewTransaction {
  id: string;
  categoryId: string;
  amountMinor: Minor;
  txnDate: string;
  note: string | null;
  paidBy: string;
  sweptFromPeriod?: string | null;
}

export interface TransactionPatch {
  categoryId?: string;
  amountMinor?: Minor;
  txnDate?: string;
  note?: string | null;
  paidBy?: string;
}
