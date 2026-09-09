/** Ledger domain types. All amounts are integer minor units. */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type NormalBalance = "debit" | "credit";

export interface LedgerAccount {
  id: string;
  orgId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  currency: string;
}

/** A single leg of a journal entry. Exactly one of debit/credit is > 0. */
export interface LineItemInput {
  accountId: string;
  debit: number;
  credit: number;
  currency: string;
  memo?: string;
}

/** A balanced journal entry to be posted atomically. */
export interface JournalEntryInput {
  orgId: string;
  description: string;
  transactionId?: string;
  userId?: string;
  provider?: string;
  providerResponse?: Record<string, unknown>;
  lines: LineItemInput[];
}
