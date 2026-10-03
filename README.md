# Dental Clinic

Next.js application implementing `Dental_Clinic_Nextjs_Technical_Implementation_Plan.md` incrementally.

## Local development

Use the Node version in `.node-version` and pnpm 10.12.4.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The interactive demo runs without external services or credentials. It uses fictional patients and in-memory state; all changes reset on refresh. Supabase, authentication and durable storage are deferred by request.

## Demo walkthrough

1. Open Patients, register a fictional patient, and search by name, phone or ID.
2. Book a 30-minute appointment; a conflicting dentist or patient slot is rejected.
3. Open Appointments on the selected date and check the patient in.
4. Open the visit, review alerts, enter fictional notes and add treatment items.
5. Complete the demo visit; notes become read-only and dashboard counts update.
6. Open the patient account, review an eligible treatment's illustrative PKR price, and post its charge.
7. Record a partial or full demo payment and open the receipt. Print / Save PDF uses the browser print dialog.
8. Open Expenses and record fictional paid spending by category and method.
9. Open Daily closing, enter opening and counted cash, explain any difference, and close the demo day. Expenses, charges and payments are then locked until refresh.

For a quick billing walkthrough, open Billing → Amina Shah. Her completed synthetic consultation is ready to charge at an illustrative PKR 1,500.00. No real money is collected.

The fixed demo day is 29 September 2026. Navigation preserves in-memory changes; a refresh intentionally resets everything. Never enter real patient data.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test:billing
pnpm test:operations
pnpm build
pnpm start
```

`pnpm check` runs lint, type checks, the demo billing and operations rule tests, and the production build. CI repeats them with the committed lockfile. The demo has been exercised manually through browser automation; evidence is recorded in docs/implementation-status.md. Twelve automated billing and operations rule tests cover exact amounts, allocation, retries, overpayment, patient isolation, and receipt snapshots. A durable browser regression suite and real database suites remain future work.

## Structure

- `src/app`: App Router pages and shared layout.
- `src/components/ui`: shadcn-compatible shared component source.
- `src/components/demo`: isolated demo provider, screens and visit editor.
- `src/lib/demo`: synthetic fixtures and demo types.
- `src/lib`: client-safe helpers.
- `docs/architecture`: package versions and implementation decisions.

The technical plan defines module boundaries, database access, permissions and milestone gates. Add modules only as their tickets start. T002 introduces validated environment configuration; T003 introduces the private database schema; T004–T006 introduce identity, authorization and audit.

See `docs/implementation-status.md` for evidence and remaining work. A working foundation does not mean the clinic application is ready for real use.

## Local database preparation

The initial five-table organization schema, reviewed SQL migrations, restricted runtime role and environment checks are prepared. The UI remains the in-memory demo. No database has been started or migrated on this host.

Follow [the local database runbook](docs/runbooks/local-database.md) for optional Docker setup and the `env:check`, `db:migrate`, `db:prepare-runtime` and `db:verify` commands. No Supabase account or secrets are needed for this local preparation.
