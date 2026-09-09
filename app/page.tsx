import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <span className="badge bg-slate-200 text-slate-700">Qatar · GCC · QFC-compliant</span>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
        FlowOrchestrator
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Embedded finance workflow orchestration for vertical SaaS platforms.
        Route payments across Stripe, Checkout.com and Fawri+, keep a unified
        double-entry ledger, and stay QFC-audit ready — from one API.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Open dashboard
        </Link>
        <a
          href="#api"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          View API
        </a>
      </div>

      <section id="api" className="mt-16">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          One endpoint
        </h2>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-5 text-sm text-slate-100">
{`POST /api/v1/payments
Authorization: Bearer fo_live_...
Idempotency-Key: order-4821

{
  "amount": 15000,        // minor units (QAR 150.00)
  "currency": "QAR",
  "reference": "order-4821"
}`}
        </pre>
      </section>

      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          ["Multi-PSP routing", "Currency- and amount-aware routing with automatic failover."],
          ["Unified ledger", "Balanced double-entry postings for every transaction."],
          ["QFC audit trails", "Immutable, timestamped, 7-year-retained event logs."],
        ].map(([title, body]) => (
          <div key={title} className="card">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
