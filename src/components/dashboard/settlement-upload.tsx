"use client";

import { useState, useTransition } from "react";
import { uploadSettlements, type SettlementUploadSummary } from "@/lib/dashboard/actions";

/** Settlement-file upload with an inline reconciliation summary. */
export function SettlementUpload() {
  const [summary, setSummary] = useState<SettlementUploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setSummary(null);
    start(async () => {
      try {
        setSummary(await uploadSettlements(formData));
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="card">
      <h3 className="font-semibold text-slate-900">Upload settlement file</h3>
      <p className="mt-1 text-sm text-slate-500">
        CSV with columns <code className="rounded bg-slate-100 px-1">provider,provider_ref,amount,currency</code>{" "}
        (amount in minor units). Rows are matched to succeeded payments.
      </p>
      <form action={onSubmit} className="mt-3 flex items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {pending ? "Reconciling…" : "Reconcile"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {summary && (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <Stat label="Matched" value={summary.matched} tone="success" />
            <Stat label="Discrepancies" value={summary.discrepancies} tone="warn" />
            <Stat label="Unmatched payments" value={summary.unmatchedPayments} tone="warn" />
            <Stat label="Unmatched settlements" value={summary.unmatchedSettlements} tone="warn" />
          </div>
          {summary.parseErrors.length > 0 && (
            <details className="mt-3 text-sm text-amber-700">
              <summary className="cursor-pointer">{summary.parseErrors.length} row warning(s)</summary>
              <ul className="mt-1 list-disc pl-5">
                {summary.parseErrors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "warn" }) {
  const color = tone === "success" ? "text-emerald-600" : value > 0 ? "text-amber-600" : "text-slate-400";
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
