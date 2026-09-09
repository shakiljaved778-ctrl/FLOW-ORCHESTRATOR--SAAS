import type { SettlementRecord } from "./reconciliation";
import { parseCsvTable, parseSettlementCsv, type ParseResult } from "./settlement";
import { toMinorUnits } from "@/lib/utils/money";
import type { PSP } from "@/lib/orchestration/types";

/**
 * Per-provider settlement-report adapters.
 *
 * Each PSP exports settlement/payout reports in its own CSV layout with its own
 * column names and amount conventions. These adapters map a raw report into the
 * canonical { provider, provider_ref, amount(minor), currency } records that the
 * reconciliation matcher consumes — so an admin can upload a provider's report
 * verbatim instead of hand-building the canonical CSV.
 */

export type SettlementFormat = "canonical" | "stripe" | "checkout" | "fawri";

export const SETTLEMENT_FORMATS: { value: SettlementFormat; label: string }[] = [
  { value: "canonical", label: "Canonical (provider,provider_ref,amount,currency)" },
  { value: "stripe", label: "Stripe — balance/payout report" },
  { value: "checkout", label: "Checkout.com — statement report" },
  { value: "fawri", label: "Fawri+ — transfers report (provisional)" },
];

export function isSettlementFormat(v: string): v is SettlementFormat {
  return SETTLEMENT_FORMATS.some((f) => f.value === v);
}

interface FormatSpec {
  provider: PSP;
  /** Candidate columns for the payment reference; first non-empty wins. */
  refColumns: string[];
  /** Candidate columns for the amount; first present column is used. */
  amountColumns: string[];
  /** Whether the report amount is in major units (e.g. "150.00") or minor units. */
  amountUnit: "major" | "minor";
  currencyColumn: string;
  /** Optional row filter — return false to skip a row silently (fees, payouts). */
  includeRow?: (get: (col: string) => string) => boolean;
}

const SPECS: Record<Exclude<SettlementFormat, "canonical">, FormatSpec> = {
  // Stripe itemized balance change / unified payments report.
  stripe: {
    provider: "stripe",
    refColumns: ["payment_intent_id", "charge_id", "source_id", "id"],
    amountColumns: ["gross", "amount"],
    amountUnit: "major",
    currencyColumn: "currency",
    // Only reconcile charge/payment rows when the report distinguishes them.
    includeRow: (get) => {
      const cat = get("reporting_category").toLowerCase();
      return cat === "" || cat === "charge" || cat === "payment";
    },
  },
  // Checkout.com statement / settlement report.
  checkout: {
    provider: "checkout",
    refColumns: ["payment_id", "action_id", "id"],
    amountColumns: ["amount", "processing_amount"],
    amountUnit: "major",
    currencyColumn: "currency",
  },
  // Fawri+ transfers report — provisional partner layout.
  fawri: {
    provider: "fawri",
    refColumns: ["transfer_id", "reference", "id"],
    amountColumns: ["amount"],
    amountUnit: "minor",
    currencyColumn: "currency",
  },
};

function parseWithSpec(text: string, spec: FormatSpec): ParseResult {
  const errors: string[] = [];
  const records: SettlementRecord[] = [];

  const table = parseCsvTable(text);
  if (!table) return { records, errors: ["File is empty."] };

  // Match columns loosely: "Payment ID", "payment_id" and "paymentid" all equal.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headerNorm = table.header.map(norm);
  const colIndex = (name: string) => headerNorm.indexOf(norm(name));
  const refIdx = spec.refColumns.map(colIndex).filter((i) => i !== -1);
  const amountIdx = spec.amountColumns.map(colIndex).find((i) => i !== -1) ?? -1;
  const currencyIdx = colIndex(spec.currencyColumn);

  if (refIdx.length === 0) {
    errors.push(`Report has none of the expected reference columns: ${spec.refColumns.join(", ")}.`);
  }
  if (amountIdx === -1) {
    errors.push(`Report is missing an amount column (${spec.amountColumns.join(" / ")}).`);
  }
  if (currencyIdx === -1) {
    errors.push(`Report is missing the "${spec.currencyColumn}" column.`);
  }
  if (errors.length > 0) return { records, errors };

  for (let i = 0; i < table.rows.length; i++) {
    const cols = table.rows[i];
    const get = (col: string) => {
      const j = colIndex(col);
      return j === -1 ? "" : (cols[j] ?? "").trim();
    };
    const rowNum = i + 2;

    if (spec.includeRow && !spec.includeRow(get)) continue;

    const providerRef = refIdx.map((j) => (cols[j] ?? "").trim()).find((v) => v.length > 0) ?? "";
    if (!providerRef) {
      errors.push(`Row ${rowNum}: no payment reference found.`);
      continue;
    }

    const currency = (cols[currencyIdx] ?? "").trim().toUpperCase();
    if (!currency) {
      errors.push(`Row ${rowNum}: missing currency.`);
      continue;
    }

    const amountRaw = (cols[amountIdx] ?? "").trim().replace(/,/g, "");
    let amount: number;
    try {
      amount = spec.amountUnit === "major" ? toMinorUnits(amountRaw, currency) : Number(amountRaw);
    } catch (e) {
      errors.push(`Row ${rowNum}: ${(e as Error).message}`);
      continue;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      errors.push(`Row ${rowNum}: invalid amount "${amountRaw}".`);
      continue;
    }

    records.push({ provider: spec.provider, providerRef, amount, currency });
  }

  return { records, errors };
}

/** Parse a settlement report in the given provider format into canonical records. */
export function parseSettlementReport(text: string, format: SettlementFormat): ParseResult {
  if (format === "canonical") return parseSettlementCsv(text);
  return parseWithSpec(text, SPECS[format]);
}
