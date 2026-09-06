export type CategoryType = 'expense' | 'income' | 'savings';

export interface Member {
  id: string;
  displayName: string;
  role: 'owner' | 'member';
}

export interface Me {
  id: string;
  displayName: string;
  household: { id: string; name: string; currency: string; members: Member[] };
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  targetAmountMinor: number | null;
  sortOrder: number;
  archivedAt: string | null;
  lastUsedAt: string | null;
}

export interface Transaction {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryType: CategoryType;
  amountMinor: number;
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

export interface BudgetRow {
  categoryId: string;
  name: string;
  type: 'expense' | 'savings';
  plannedMinor: number;
  spentMinor: number;
  remainingMinor: number;
}

export interface UnbudgetedRow {
  categoryId: string;
  name: string;
  spentMinor: number;
}

export interface SummaryResponse {
  period: string;
  leftToSpendMinor: number;
  unbudgetedMinor: number;
  unbudgetedRows: UnbudgetedRow[];
  savedThisMonthMinor: number;
  savingsTotalMinor: number;
  overcommitted: boolean;
  budgetRows: BudgetRow[];
  recentEntries: Transaction[];
  sweptPeriods: string[];
}

export interface BudgetResponse {
  period: string;
  rows: BudgetRow[];
  unbudgetedRows: UnbudgetedRow[];
  unbudgetedMinor: number;
  overcommitted: boolean;
  sweepOffer: { fromPeriod: string; amountMinor: number } | null;
}

export interface SavingsResponse {
  savingsTotalMinor: number;
  goals: {
    categoryId: string;
    name: string;
    savedMinor: number;
    targetAmountMinor: number | null;
    reached: boolean;
    archived: boolean;
  }[];
  contributions: Transaction[];
}

export interface TransactionsResponse {
  transactions: Transaction[];
  sweptPeriods: string[];
}
