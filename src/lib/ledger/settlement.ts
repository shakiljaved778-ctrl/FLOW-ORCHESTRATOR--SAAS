import type { SettlementRecord } from "./reconciliation";

/**
 * Canonical settlement CSV format (header row required):
 *
 *   provider,provider_ref,amount,currency
 *   stripe,pi_3AbC,15000,QAR
 *
 * `amount` is in minor units. Provider must be one of stripe|checkout|fawri.
 * PSP-specific report formats are mapped to this canonical shape upstream.
 */

const VALID_PROVIDERS = new Set(["stripe", "checkout", "fawri"]);

export interface ParseResult {
  records: SettlementRecord[];
  errors: string[];
}

/** Split a single CSV line, honoring simple double-quote quoting. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseSettlementCsv(text: string): ParseResult {
  const errors: string[] = [];
  const records: SettlementRecord[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { records, errors: ["File is empty."] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    provider: header.indexOf("provider"),
    providerRef: header.indexOf("provider_ref"),
    amount: header.indexOf("amount"),
    currency: header.indexOf("currency"),
  };
  const missing = Object.entries(idx)
    .filter(([, v]) => v === -1)
    .map(([k]) => k);
  if (missing.length > 0) {
    return { records, errors: [`Missing required columns: ${missing.join(", ")}`] };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const provider = (cols[idx.provider] ?? "").toLowerCase();
    const providerRef = cols[idx.providerRef] ?? "";
    const amountRaw = cols[idx.amount] ?? "";
    const currency = (cols[idx.currency] ?? "").toUpperCase();
    const rowNum = i + 1;

    if (!VALID_PROVIDERS.has(provider)) {
      errors.push(`Row ${rowNum}: invalid provider "${provider}".`);
      continue;
    }
    if (!providerRef) {
      errors.push(`Row ${rowNum}: missing provider_ref.`);
      continue;
    }
    const amount = Number(amountRaw);
    if (!Number.isInteger(amount) || amount <= 0) {
      errors.push(`Row ${rowNum}: amount must be a positive integer (minor units), got "${amountRaw}".`);
      continue;
    }
    if (!currency) {
      errors.push(`Row ${rowNum}: missing currency.`);
      continue;
    }

    records.push({ provider, providerRef, amount, currency });
  }

  return { records, errors };
}

/** A local payment's settling reference, for matching against settlements. */
export interface PaymentRef {
  paymentId: string;
  provider: string;
  providerRef: string | null;
  amount: number;
  currency: string;
}

export interface MatchResult {
  matched: { paymentId: string; settlement: SettlementRecord }[];
  /** Settlement lines whose amount/currency didn't match the payment. */
  discrepancies: { paymentId: string; settlement: SettlementRecord }[];
  unmatchedPayments: string[];
  unmatchedSettlements: SettlementRecord[];
}

/**
 * Pure matching: pair payments to settlement lines by (provider, provider_ref).
 * A pair with mismatched amount/currency is a discrepancy, not a match.
 */
export function matchSettlements(payments: PaymentRef[], settlements: SettlementRecord[]): MatchResult {
  const settlementByKey = new Map(settlements.map((s) => [`${s.provider}:${s.providerRef}`, s]));
  const usedKeys = new Set<string>();

  const matched: MatchResult["matched"] = [];
  const discrepancies: MatchResult["discrepancies"] = [];
  const unmatchedPayments: string[] = [];

  for (const p of payments) {
    if (!p.providerRef) {
      unmatchedPayments.push(p.paymentId);
      continue;
    }
    const key = `${p.provider}:${p.providerRef}`;
    const settlement = settlementByKey.get(key);
    if (!settlement) {
      unmatchedPayments.push(p.paymentId);
      continue;
    }
    usedKeys.add(key);
    if (settlement.amount === p.amount && settlement.currency === p.currency) {
      matched.push({ paymentId: p.paymentId, settlement });
    } else {
      discrepancies.push({ paymentId: p.paymentId, settlement });
    }
  }

  const unmatchedSettlements = settlements.filter(
    (s) => !usedKeys.has(`${s.provider}:${s.providerRef}`),
  );

  return { matched, discrepancies, unmatchedPayments, unmatchedSettlements };
}
