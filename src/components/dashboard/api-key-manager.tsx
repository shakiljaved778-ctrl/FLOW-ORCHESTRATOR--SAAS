"use client";

import { useState, useTransition } from "react";
import { createApiKey } from "@/lib/dashboard/actions";

/** Create-key form. Shows the generated plaintext ONCE, then never again. */
export function ApiKeyCreator() {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        const { plaintext } = await createApiKey(formData);
        setPlaintext(plaintext);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="card">
      <form action={onSubmit} className="flex items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-slate-600">New key name</span>
          <input
            name="name"
            required
            placeholder="e.g. Production integration"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate key"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {plaintext && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">
            Copy this key now — it will not be shown again.
          </p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900">
            {plaintext}
          </code>
        </div>
      )}
    </div>
  );
}
