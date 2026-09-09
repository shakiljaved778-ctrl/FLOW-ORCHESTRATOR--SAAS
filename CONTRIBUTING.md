# Contributing

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Clerk / Supabase / Stripe keys
npm run dev
```

## Before you push

Run the same gates CI runs — all three must pass:

```bash
npm run typecheck
npm run test
npm run build
```

`npm run test:watch` is handy while developing.

## Branching & commits

- Branch off `main`: `feat/…`, `fix/…`, `chore/…`.
- Keep changes focused; prefer small, reviewable PRs.
- Write imperative commit subjects ("Add …", "Fix …") with a short body
  explaining the *why* when it isn't obvious.
- Open a PR into `main`; CI (typecheck + test + build) runs automatically.

## Where things live

| Area | Path |
| --- | --- |
| Orchestration (routing, failover, idempotency, orchestrator) | `src/lib/orchestration/` |
| PSP adapters (behind one interface) | `src/lib/providers/` |
| Double-entry ledger + reconciliation | `src/lib/ledger/` |
| Immutable audit logging + PCI sanitization | `src/lib/audit/` |
| Auth (Clerk + scoped API keys) | `src/lib/auth/` |
| Supabase clients + realtime | `src/lib/db/` |
| API routes | `app/api/` |
| Dashboard pages + server actions | `app/(dashboard)/`, `src/lib/dashboard/` |
| SQL schema, RLS, RPC | `supabase/migrations/` |
| Tests (unit + integration) | `tests/` |

## Conventions that matter

- **Money is always integer minor units** — never floats. Use `src/lib/utils/money.ts`.
- **Ledger entries post through `post_journal_entry`** (the RPC) so header + legs
  are atomic; they are append-only and must balance.
- **Audit logs are append-only** and payloads are sanitized before storage — add
  new sensitive keys to `src/lib/audit/sanitize.ts`.
- **New PSPs** implement `PaymentProvider` (`src/lib/providers/provider.interface.ts`)
  and register in `src/lib/providers/index.ts` + routing config.
- **Trusted server code** uses the service-role client and MUST filter by `org_id`;
  dashboard reads rely on RLS.

## Adding a database change

1. Add a new numbered file in `supabase/migrations/` (never edit an applied one).
2. Keep it idempotent/guarded where practical.
3. Apply migrations **before** deploying code that depends on them.

## Recommended branch protection (`main`)

In GitHub → Settings → Branches → add a rule for `main`:

- [x] Require a pull request before merging
- [x] Require status checks to pass → select **CI / Typecheck · Test · Build**
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

This makes green CI a merge gate. (Requires repo-admin access to configure.)
