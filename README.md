# FlowOrchestrator

Embedded Finance Workflow Orchestrator for vertical SaaS platforms in Qatar / the GCC.

This MVP focuses on **payment orchestration**: a unified payments API with
multi-PSP routing and failover, a unified double-entry ledger, a real-time
dashboard, and QFC-compliant immutable audit trails.

## Stack

- **Next.js 16** (App Router), React 19, TypeScript, Tailwind CSS
- **Supabase** PostgreSQL (RLS + realtime)
- **Clerk** authentication with multi-tenant Organizations
- **Stripe** (live in week 1, sandbox) · **Checkout.com** & **Fawri+** (weeks 3-4, stubbed)
- **Vercel** serverless deployment

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Clerk, Supabase, Stripe keys

# Apply the database schema (requires the Supabase CLI + a linked project)
npm run db:migrate
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # optional demo org + chart of accounts

npm run dev
```

Then open http://localhost:3000.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Run the Vitest suite |
| `npm run lint` | Next.js lint |
| `npm run db:migrate` | Apply Supabase migrations |

## Architecture

```
app/                     Next.js routes (dashboard + API)
  api/v1/payments        Unified payment endpoint (idempotent, API-key auth)
  api/webhooks/*         PSP webhook handlers (normalized events)
  (dashboard)/*          Authenticated dashboard (Clerk-gated)
src/lib/
  orchestration/         Routing, failover, idempotency, orchestrator
  providers/             PSP adapters behind one interface
  ledger/                Double-entry service + reconciliation
  audit/                 Immutable audit logging + PCI sanitization
  auth/                  Clerk + scoped API-key helpers
  db/                    Supabase clients (service + anon) and realtime
supabase/migrations/     SQL schema, constraints, and RLS policies
tests/                   Ledger, routing, failover, idempotency invariants
```

### Design decisions

- **Money is always integer minor units** — never floats — so the ledger balances exactly.
- **PSP adapter pattern** — Stripe is live; Checkout.com and Fawri+ implement the
  same `PaymentProvider` interface and drop in for weeks 3-4.
- **The ledger is append-only and self-balancing** — a deferred DB constraint
  trigger rejects any journal entry where debits ≠ credits, and updates/deletes
  on posted entries are blocked at the database level.
- **Audit logs are immutable** (append-only, 7-year retention) and record UTC +
  Qatar-local timestamps, actor, org, action, and PCI-sanitized payloads.
- **Tenancy** is enforced by RLS for dashboard reads (Clerk JWT → `org_id`) and
  in application code for trusted service-role writes.

## API example

```bash
curl -X POST https://<app>/api/v1/payments \
  -H "Authorization: Bearer fo_live_..." \
  -H "Idempotency-Key: order-4821" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 15000, "currency": "QAR", "reference": "order-4821" }'
```

`amount` is in minor units (QAR 150.00 → `15000`).

## Payment providers

| Provider | Region | Currencies | Status |
| --- | --- | --- | --- |
| Stripe | Global cards | USD, AED, QAR | ✅ live (sandbox) |
| Checkout.com | MENA acquiring | AED, USD, QAR | ✅ implemented |
| Fawri+ | Qatar instant transfers | QAR only | ✅ implemented (provisional partner contract) |

Each adapter implements the shared `PaymentProvider` interface and is toggled by
a `PSP_<NAME>_ENABLED` env flag; the router skips disabled providers and fails
over across the enabled ones. Card data is never handled server-side — platforms
tokenize client-side and pass the token as `metadata.source`.

> **Fawri+ note:** Fawri+ (Qatar Central Bank instant-payment scheme) has no
> public REST API and is reached through a licensed banking/PSP partner. The
> adapter targets a provisional, configurable contract (`FAWRI_API_BASE`);
> adjust the request shape and `mapFawriStatus` when the partner spec is final.

## Roadmap

- **Weeks 1-2:** Stripe orchestration, ledger, dashboard, audit, Clerk multi-tenancy ✅
- **Weeks 3-4:** Checkout.com + Fawri+ adapters and webhook handlers ✅
- **Reconciliation & compliance:** settlement-file (CSV) upload with matching,
  and CSV + PDF audit-trail export ✅
- **Next:** finalize the Fawri+ partner integration against a production spec;
  transactional `post_journal_entry` RPC; live PSP sandbox integration tests.

## Reconciliation

Admins upload a PSP settlement report as CSV on the Reconciliation page:

```
provider,provider_ref,amount,currency
stripe,pi_3AbC,15000,QAR
checkout,pay_9x,5000,AED
```

Each row is matched to a succeeded payment by `(provider, provider_ref)`. Equal
amount/currency → **matched**; a reference match with a different amount →
**discrepancy**; no payment → **unmatched settlement**. Results persist to the
`settlements` table and the upload is audited.

## Audit export

The Audit page (admin-only) exports the immutable trail as **CSV** or a
paginated **PDF** report (`/api/v1/audit/export` and `.../export/pdf`) carrying
org identity, UTC + Qatar generation time, and the operator — for QFC filings.
