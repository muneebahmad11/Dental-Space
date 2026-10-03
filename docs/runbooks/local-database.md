# Local database and staff workspace

The main app now uses verified Supabase staff sign-in and database-backed records. `/patients` manages saved demographics, `/appointments` opens the authorized branch calendar, and `/` shows database totals. `/staff` redirects to `/patients`. Unconnected financial and clinical routes show an explicit unavailable state; no demo records or fabricated balances are displayed. Historical demo source and rule tests remain in the repository but are not mounted by app routes.

## Native PostgreSQL on this development host

PostgreSQL 17.11 is installed via Homebrew. The app uses its own cluster in ignored `.local/postgres`, bound to `127.0.0.1:54329`, with SCRAM passwords. It does not use or start Homebrew's default cluster. Credentials are randomly generated into ignored `.env.local` with restrictive file permissions; never commit or share that file.

```sh
pnpm db:local start
pnpm env:check
pnpm db:migrate
pnpm db:prepare-runtime
pnpm db:verify
pnpm db:verify-patients
pnpm db:local status
```

Stop this cluster without deleting its data with `pnpm db:local stop`. `POSTGRES_BIN` can point to another PostgreSQL 17 binary directory. No launch-at-login service is installed. Local setup preserves existing `.env.local` and refuses unexpected connection targets.

Docker Compose remains an alternative for a separate disposable setup. Do not start it on the same port as the native cluster. Its example credentials are public development values, unsuitable for shared services. This host uses the native cluster, not a Docker volume.

## Implemented schema and access

- Clinics, branches, application users, memberships and branch assignments.
- Permission catalog, clinic roles, role permissions, membership roles and direct grants.
- Patient demographics, normalized phone search data and optimistic edit versions.
- Append-only audit events with same-clinic actor and branch foreign keys. Patient mutations and audit writes share one transaction.

`clinic_runtime` is non-owner/non-superuser with no DDL, organization writes or patient deletion. It can read authorization tables, select/insert/update patients, and select/insert audit events. Runtime SQL grants alone do not provide per-user isolation: server services verify active identity-linked membership, branch and permissions, and scope all patient operations by clinic. Keep `clinic_app` out of Supabase Data API exposed schemas.

The server verifies identity using Supabase `getUser()`. Scope headers only select an authorized branch; they cannot grant access. No endpoint accepts a caller-supplied identity or permission list. Owner role templates do not imply clinical signing permission. Mutation routes require the configured application Origin, JSON bodies under 16 KiB and validated fields. API results are private/no-store.

The external Auth UUID is not authentication by itself. Staff provisioning must bind it to an actual verified Supabase user. No FK to `auth.users` exists in plain local PostgreSQL. Provisioning UI and audited membership administration remain pending.

## Staff API

- `POST /api/auth/login`: email/password sign-in through Supabase.
- `POST /api/auth/logout`: local session sign-out.
- `GET /api/v1/audit-events`: last 100 events for the selected clinic/branch, requiring `audit.read`.
- `GET /api/v1/session`: active clinic/branch choices for the verified identity.
- `GET /api/v1/patients`: authorized demographic search, 50 records maximum, `search` and `offset` parameters.
- `POST /api/v1/patients`: authorized registration with a required UUID `operationId`. Identical retries return the existing record; changed payloads with the same key return 409.
- `PATCH /api/v1/patients/:id`: authorized edit with `expectedVersion` and `patient` fields; stale/unavailable records return 409.

Patient routes require `x-clinic-id` and `x-branch-id`. Clinical information is absent from demographic DTOs. Duplicate resolution, detailed read auditing and production abuse controls are still pending. Retries must preserve the operation ID and original fields. The UI retains its retry key while mounted; keys are not persisted across reloads.

## Verification

`db:verify` checks distinct runtime login, forbidden organization writes/DDL and cross-clinic foreign keys. `db:verify-patients` exercises create/search/edit, stale versions, actual second-clinic isolation, missing permissions, revoked membership, audit immutability and rollback of creation when audit insertion fails. All test fixtures and temporary grants roll back. Both passed on the native PostgreSQL cluster.

CI runs migration and both verification scripts against its PostgreSQL service. Remote CI has not been run. `pnpm check` covers lint, TypeScript, 16 existing rule/configuration tests and a production build.

## Migrations

Generate with `pnpm db:generate`; review generated SQL and metadata together. Never edit applied migrations or use schema push against deployed data. Migration commands serialize with an advisory lock and use a separate credential. Local scripts refuse remote targets and do not run automatically during build/start.

## Connect Auth later

Configure `NEXT_PUBLIC_APP_URL` to the exact browser origin (including port), plus `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, then restart Next.js. Use `pnpm env:check supabase` to validate fields. No secrets belong in chat.

Supabase dental-dev is configured and the first verified account has local demographic read/write and audit read grants. Appointment read/write grants remain pending explicit approval. The user previously confirmed signed-in registration and the saved Test Patient plus its audit event were verified in PostgreSQL. Hosted database migrations require a separately reviewed deployment path; current commands deliberately reject remote write targets. Do not reuse local passwords on Supabase.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Drizzle migrations](https://orm.drizzle.team/docs/migrations).

## Persistent appointments

The Appointments page includes a branch day calendar. Requests to `/api/v1/appointments` support GET (ISO-offset startsAt/endsAt range, up to 31 days) and POST (patientId, startsAt, endsAt, UUID operationId). PATCH `/api/v1/appointments/:id` takes expectedVersion and status (`arrived` or `cancelled`). Read/write appointment permissions are separate from demographic permissions; both workflows also require demographic read. Booking duration is 1 minute–8 hours. The first slice has one branch calendar and no overbooking overrides, rescheduling or clinician resource allocation.

After explicit approval, `node --experimental-strip-types scripts/grant-local-appointments.ts AUTH_USER_UUID` grants appointment.read/write only to the single local Development Dental Clinic membership and audits the grant. This command has been prepared but not executed for the initial user.


## Persistent expenses

Migration 0006 adds append-only paid expenses. GET `/api/v1/expenses?paidOn=YYYY-MM-DD&offset=0` returns at most 50 branch records plus full-day total/cash totals as integer paisa strings. POST accepts `operationId` (UUID), `paidOn`, `description`, `category`, `method` and decimal string `amount`. PKR is the supported currency. Methods: Cash, Card, Bank transfer. Categories: Supplies, Laboratory, Utilities, Maintenance, Other.

`expense.read` and `expense.write` are separate permissions; schema migration never grants them to a real account. After explicit approval, `node --experimental-strip-types scripts/grant-local-expenses.ts AUTH_USER_UUID` grants these two permissions to the single local development membership and audits the change. This script has not been executed for the initial user.

`pnpm db:verify-patients` also runs expense integration checks with rollback-only synthetic fixtures. `pnpm test:expenses` checks date/amount validation. Expense corrections and closing locks will be added with future finance workflows. Supabase still provides authentication; records are stored in local PostgreSQL.
