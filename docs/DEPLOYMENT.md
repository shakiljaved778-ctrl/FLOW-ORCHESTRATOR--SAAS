# Deployment Checklist

Deploying FlowOrchestrator to production (Vercel + Supabase + Clerk). Work top to
bottom — later steps assume earlier ones are done.

## 0. Accounts & prerequisites

- [ ] Vercel project connected to this repository
- [ ] Supabase project created (note the project URL and keys)
- [ ] Clerk application created with **Organizations** enabled
- [ ] Stripe account (start in **test mode**)
- [ ] Checkout.com sandbox account (for MENA) — optional until go-live
- [ ] Fawri+ partner/sandbox access (Qatar) — optional until go-live
- [ ] Node 20+ and the Supabase CLI installed locally (`supabase --version`)

## 1. Database (Supabase)

Apply migrations **in order** — they build on each other:

```bash
supabase link --project-ref <your-ref>
supabase db push            # applies supabase/migrations/0001 … 0008
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # optional: demo org + chart of accounts
```

- [ ] All 8 migrations applied (tenancy → ledger → payments → audit → RLS →
      settlements → `post_journal_entry` RPC → realtime publication)
- [ ] Verify RLS is **enabled** on every table (`0005_rls.sql`)
- [ ] Verify the `post_journal_entry` function exists and is granted to
      `service_role` only (`0007`)
- [ ] Confirm `payments`, `journal_entries`, `settlements` are in the
      `supabase_realtime` publication (`0008`)

> **Order matters at deploy time:** apply migrations *before* shipping code that
> depends on them (the app calls `post_journal_entry`; payment capture fails
> without it).

## 2. Authentication (Clerk)

- [ ] Enable **Organizations** in the Clerk dashboard
- [ ] Configure the sign-in/up URLs to match the app (`/sign-in`, `/sign-up`)
- [ ] Create the **Clerk ⇄ Supabase JWT** so RLS and realtime can read the org:
  - The JWT must include an `org_id` claim (the Clerk organization id) and an
    `org_role` claim — `current_org_id()` and `is_org_admin()` (in `0005_rls.sql`)
    read these.
  - Add Clerk as a third-party auth provider in Supabase (or configure the JWT
    template), so the anon-key client authorized with a Clerk token passes RLS.
- [ ] Map each platform's users into a Clerk **Organization** (one org = one
      `organizations` row via `clerk_org_id`)

> Provision an `organizations` row for every Clerk org (the demo seed shows the
> shape). A signed-in user with no matching org row will hit "Organization not
> provisioned".

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Set all of these (see `.env.example` for the full annotated list):

**Clerk:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`

**Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` *(server-only — never `NEXT_PUBLIC_`)*

**Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**Checkout.com:** `CHECKOUT_SECRET_KEY`, `CHECKOUT_WEBHOOK_SECRET`,
`CHECKOUT_API_BASE`, `CHECKOUT_TEST_SOURCE`

**Fawri+:** `FAWRI_API_KEY`, `FAWRI_API_BASE`, `FAWRI_WEBHOOK_SECRET`

**Provider flags:** `PSP_STRIPE_ENABLED`, `PSP_CHECKOUT_ENABLED`, `PSP_FAWRI_ENABLED`

**App:** `NEXT_PUBLIC_APP_URL`, `SUPPORTED_CURRENCIES`

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is **not** exposed to the client (no
      `NEXT_PUBLIC_` prefix)
- [ ] Secrets set for the correct environments (Production / Preview separated)
- [ ] Start with only `PSP_STRIPE_ENABLED=true`; enable the others once their
      credentials and webhooks are verified

## 4. PSP webhooks

Register each provider's webhook to the deployed URL and copy the signing secret
into the matching env var:

- [ ] **Stripe** → `https://<app>/api/webhooks/stripe`; events:
      `payment_intent.succeeded`, `payment_intent.payment_failed`,
      `charge.refunded`. Set `STRIPE_WEBHOOK_SECRET`.
- [ ] **Checkout.com** → `https://<app>/api/webhooks/checkout`; set
      `CHECKOUT_WEBHOOK_SECRET` (signature key)
- [ ] **Fawri+** → `https://<app>/api/webhooks/fawri`; set `FAWRI_WEBHOOK_SECRET`
- [ ] Send a test event from each provider and confirm a `webhook.received` audit
      log appears

## 5. Application (Vercel)

- [ ] Framework preset: **Next.js** (auto-detected via `vercel.json`)
- [ ] Region set close to users (`fra1` is configured in `vercel.json`)
- [ ] Deploy and confirm the build passes (CI runs typecheck + tests + build on
      every push/PR)
- [ ] Custom domain + HTTPS (automatic on Vercel)

## 6. Smoke test (post-deploy)

- [ ] Sign up, create an organization, land on the dashboard
- [ ] Create an **API key** (Settings → API Keys) and copy it once
- [ ] `POST /api/v1/payments` with the key and a small amount → `201`, appears in
      Transactions
- [ ] The **Ledger** shows a balanced entry for it; **Overview** success rate updates
- [ ] Retry the same request with the same `Idempotency-Key` → no duplicate charge
- [ ] Upload a settlement CSV in **Reconciliation** → rows match
- [ ] Export the **audit trail** as CSV and PDF (admin)
- [ ] Realtime indicator shows **Live** and a new payment appears without reload

## 7. Compliance (QFC) — verify before onboarding real platforms

- [ ] Audit logs are immutable (the DB blocks update/delete) and capture actor,
      org, action, IP, UA, UTC + Qatar time
- [ ] PCI: request/response payloads and provider responses are sanitized before
      storage (`src/lib/audit/sanitize.ts`)
- [ ] Data retention: `audit_logs.retain_until` defaults to 7 years; confirm your
      backup/retention policy honors it
- [ ] Only org **admins** can read/export audit logs (RLS + route guards)

## Rollback

- Vercel: promote the previous deployment (instant).
- Database: migrations are additive; new code tolerates their absence only where
  noted. Roll back code first, then reverse a migration deliberately if required.
  Ledger and audit rows are append-only by design and are not deleted on rollback.
