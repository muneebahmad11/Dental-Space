# Dental Space

Next.js clinic application implementing the [technical plan](Dental_Clinic_Nextjs_Technical_Implementation_Plan.md). Main screens use authenticated, saved records. Supabase provides staff authentication; development business data currently lives in a local PostgreSQL database.

## Run locally

Use the Node version in `.node-version` and pnpm 10.12.4.

```sh
corepack enable
pnpm install --frozen-lockfile
touch .env.local
```

Configure separate restricted runtime and migration database credentials, the Supabase project URL/publishable key, and your exact application origin. Keep `.env.local` private. Follow [the database runbook](docs/runbooks/local-database.md) to start PostgreSQL and prepare roles/migrations. The database must already have an explicitly provisioned, authorized staff membership matching the Supabase Auth identity.

```sh
pnpm env:check
pnpm db:migrate
pnpm db:prepare-runtime
pnpm dev
```

Use the same hostname as `NEXT_PUBLIC_APP_URL`; write endpoints enforce its Origin. Source control excludes credentials, local database files, dependencies and build output. The repository contains no actual patient database.

## Implemented workflows

- Verified staff sign-in, clinic/branch selection, scoped permissions and append-only staff audit.
- Patient demographics, registration/search/editing, version checks and retry protection.
- Clinical visit drafts, author-only signing, immutable revisions and signed amendments.
- Treatment items, exact quantity-based PKR estimates, preserved estimate versions and immutable acceptance records.
- Branch appointments with overlap prevention, arrival/cancellation and saved calendar.
- Reviewed manual charges, partial payments with oldest-first allocation, immutable receipt snapshots, partial refunds and allocation reversals.
- Paid expense recording, exact PKR amounts, daily totals and append-only records.
- Financial date-range reports with payments/refunds/paid expenses, daily and payment-method reconciliation.
- Daily closing drafts, separate staff approval, discrepancy explanation, immutable cash snapshots and closed-day posting guards.
- WhatsApp template queue, recorded consent, signed/deduplicated webhooks, delivery history, opt-out handling and a separate durable worker. Disabled until Meta is configured.

Billing records money received/returned; it does not process card or bank transactions. Finance uses PKR and integer paisa. Closing requires a different approver from the latest draft author. New permissions are defined by migrations but never silently assigned to an existing account.

[WhatsApp setup](docs/runbooks/whatsapp.md) explains server-only configuration, templates and worker operation. Do not paste secrets into chats or commit them. Meta account setup, template approval, hosted HTTPS callbacks and live delivery remain external steps.

## Verify

```sh
pnpm check
pnpm db:verify
pnpm db:verify-patients
pnpm db:verify-finance
pnpm db:verify-messaging
pnpm db:verify-plans
```

Database checks use local synthetic fixtures and roll them back. Messaging tests use fake providers and never send real messages. CI runs static/build/unit checks and PostgreSQL integration suites. Browser acceptance and live integrations are separate gates.

## Remaining scope

The full M00–M21 plan is not complete. Treatment completion and billing links, clinical templates/alerts, tooth charts, private files, prescriptions/consents, lab/inventory, expanded reports, offline recovery, portal/online booking, automatic reminder rules, deployment and real clinic acceptance remain open. See [implementation status](docs/implementation-status.md) and [milestone checklist](docs/milestones.md).

Historical demo source remains isolated in `src/components/demo` and `src/lib/demo` for reference and rule tests; application routes do not mount it. Do not infer production readiness from pages existing or tests passing.
