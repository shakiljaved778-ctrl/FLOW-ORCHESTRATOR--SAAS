# CLAUDE.md

Guidance for AI agents working in this repository.

## What this is

FlowOrchestrator — an embedded-finance **payment orchestration** platform for
vertical SaaS in Qatar/GCC. Unified payments API → multi-PSP routing/failover →
double-entry ledger → QFC audit trails, with a multi-tenant dashboard.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres,
RLS, realtime) · Clerk (Organizations) · Stripe / Checkout.com / Fawri+ · Vercel.

## Commands

```bash
npm run dev         # dev server
npm run typecheck   # tsc --noEmit
npm run test        # vitest (unit + integration)
npm run build       # next build
```

Always run typecheck + test + build before considering a change done (CI runs all three).

## Architecture map

- `src/lib/orchestration/` — `router.ts` (currency/amount routing), `retry.ts`
  (failover), `idempotency.ts`, `orchestrator.ts` (ties it together; has
  `resolveProvider`/`availableProviders` DI seams for testing).
- `src/lib/providers/` — `provider.interface.ts` + `stripe|checkout|fawri`
  adapters + `index.ts` registry. `http.ts` is an injectable fetch helper.
- `src/lib/ledger/` — `ledger.service.ts` (`postJournalEntry` → `post_journal_entry`
  RPC), `reconciliation.ts`, `settlement.ts` (canonical CSV), `settlement-formats.ts`
  (per-PSP report adapters).
- `src/lib/audit/` — `audit.service.ts`, `sanitize.ts` (PCI), `pdf.ts` (report).
- `src/lib/db/` — `client.ts` (service + anon), `realtime.ts`.
- `app/api/` — `v1/payments`, `v1/audit/export[/pdf]`, `webhooks/{stripe,checkout,fawri}`.
- `app/(dashboard)/` — server components; `src/lib/dashboard/` has the org-scoped
  context helper and server actions.
- `supabase/migrations/` — 0001…0008. `tests/` — unit + integration
  (`tests/helpers/fake-supabase.ts` is an in-memory Supabase double).

## Non-negotiable invariants

- **Money = integer minor units.** Never floats. Use `src/lib/utils/money.ts`.
- **Ledger balances and is append-only.** Post via the `post_journal_entry` RPC;
  debits must equal credits (enforced in DB and `isBalanced`).
- **Audit logs are immutable.** Sanitize payloads (`sanitize.ts`) before storing.
- **Tenancy:** service-role writes must filter by `org_id`; dashboard reads use RLS.
- **New PSP** → implement `PaymentProvider`, register it, add routing config; charges
  must not throw on expected declines (return a failed `ChargeResult` so failover works).

## Gotchas

- Migrations are additive and must be applied **before** dependent code deploys
  (e.g. `post_journal_entry`). Never edit an applied migration.
- Realtime needs tables in the `supabase_realtime` publication (migration 0008)
  and the Clerk⇄Supabase JWT; the dashboard degrades to manual refresh otherwise.
- Checkout.com/Fawri+ are gated by `PSP_*_ENABLED` flags; Fawri+ targets a
  provisional partner contract.
