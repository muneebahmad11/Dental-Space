# 4-day plan to a sellable product

Prepared 2026-10-31, revised the same day. Goal changed from "one clinic goes live" to **"a product you can sell to any dental clinic in Pakistan"**. Task IDs (S9, F3, D3…) refer to [roadmap-to-production.md](roadmap-to-production.md), which stays the long-term plan.

## Product decisions (2026-10-31)

| Question | Decision |
|---|---|
| Market | **Pakistan first.** PKR, Asia/Karachi, Easypaisa/JazzCash. No other currencies, taxes or languages yet |
| Onboarding | **You set clinics up** from an operator console after they pay. No public signup |
| Subscription billing | **Manual.** Bank transfer or Easypaisa invoice; you mark clinics active or suspended |
| Deadline | **3–4 days** for the first sellable version; cut hard |

**"Sellable" means:** you can create a new clinic in minutes, its owner sets up staff, hours, procedures and payment methods without you, its data is provably separate from every other clinic, money can be corrected, and you can suspend a clinic that stops paying. It does **not** mean marketing-ready (no website, self-signup or online payments yet).

## Critical findings

What already works for many clinics:
- Every table carries `clinic_id` with scoped composite foreign keys, and every service scopes by clinic and branch. The data model is multi-tenant already.
- The procedure catalog, schedule setup and roles are per clinic.

What is still built for one clinic:

| Finding | Fix in this plan |
|---|---|
| A clinic can only be created by `scripts/bootstrap-local-staff.ts` (hard-coded "Development Dental Clinic") | 2.1 Operator console |
| No way to stop a clinic that doesn't pay | 2.1 Suspend/activate |
| Staff can only be added with local grant scripts. An owner can't manage their own team | 3.2 Staff admin |
| Payment methods are hard-coded in a DB check constraint (`Cash, Card, Bank transfer`) | 2.3 Methods per clinic |
| **Closing always needs a second staff member.** A solo dentist can never close the day | 2.2 Approval policy per clinic |
| Receipts have no clinic address, phone or footer | 2.2 Clinic settings |
| **WhatsApp is configured once for the whole server** (env vars). Every clinic would send from your number | Kept disabled for sale; per-clinic setup in the backlog |
| No automated test proving clinic A can't read clinic B through the API | 4.1 Tenant isolation suite |
| No credit note, so a wrong charge can't be corrected | 3.1 |
| CI red since 2026-10-11; never deployed; never walked through in a browser | Day 1 |
| PKR is enforced by DB check constraints | **Kept**: Pakistan only. Multi-currency in the backlog |

## Rules for these 4 days

1. **If a task isn't on this page, it goes to the backlog.**
2. **Use the full migration, service and verify-suite pattern only for money, access and tenant separation** (2.1, 2.3, 3.1, 3.2, 4.1). For everything else, `pnpm check` plus a browser check is enough.
3. **Deploy on Day 1** and redeploy every day.
4. **The operator (you) never sees patient data.** The operator console touches only clinics, branches, owner invites and status. This is also a selling point.
5. **Every product default must suit a typical small clinic** (1–3 dentists, 1–2 receptionists). Anything clinic-specific becomes a setting.

---

## Day 1: Stabilise and get online

- [x] **1.1 Fix CI** (1h). Find the failing step in run `38176807408` and get `main` green.
- [ ] **1.2 Browser walkthrough with a "generic" lens (0.4 + S9 check)** (3h). `pnpm db:seed-demo`, then book → arrive → visit → sign → charge → pay → receipt → follow-up → close the day, on desktop and tablet width. Log each defect, **plus anything that assumes one specific clinic**, in *Defects found* below. Fix only what blocks a sale.
- [ ] **1.3 Hosting (D1)** 👤 (30 min). Supabase **Pro** in Mumbai (`ap-south-1`), Vercel in `bom1`, product domain (e.g. `app.<product>.pk`).
- [ ] **1.4 Production database (D2, D3)** (3h). One production project with PITR. Migrations use the migration credential, create `clinic_runtime`, keep `clinic_app` out of the Data API, use the pooler with `prepare: false`, and remote targets need an explicit flag. Run verify suites only against a throwaway project.
- [ ] **1.5 Deploy (D4)** (2h). Vercel, secrets in the host's settings, HTTPS. *Done when:* the demo clinic signs in on the live URL.

## Day 2: Many clinics, one product

- [x] **2.1 Operator console** (5h). Separate `platform_operators` table, not a clinic membership, on its own route (`/operator`). The operator can create a clinic (name, city, phone, timezone defaulting to Asia/Karachi, PKR), its first branch, and an owner invite email. They can list clinics with status, plan note and paid-until date, and **suspend or reactivate** a clinic. A suspended clinic's staff get "Subscription inactive, contact <you>" at `resolveContext`; data is kept and nothing is deleted. All actions are audited. The operator gets no patient, clinical or finance access. Replaces `bootstrap-local-staff.ts` for real clinics. *Done when:* a verify suite shows a suspended clinic is blocked on every API route and the operator is denied every patient route. *Done 2026-11-11: `/operator`, `pnpm operator:grant`, `pnpm db:verify-operator`. See [operator runbook](runbooks/operator-console.md).*
- [x] **2.2 Clinic settings** (3h). Owner screen for clinic name, address, phone, receipt header and footer text, and NTN (optional). Receipts and printouts read these values, and the snapshot is frozen on the receipt. **Closing approval policy:** "second approver required" (default) or "owner may approve own closing with a written note", for solo clinics. Both are audited. *Done 2026-11-11: `/settings`, `pnpm db:verify-clinic-settings`.*
- [x] **2.3 Payment methods per clinic (F1)** (3h). Per-clinic table seeded with Cash, Card, Bank transfer, Easypaisa and JazzCash, each with a cash/non-cash flag for closing. The owner can enable or disable methods. Replace the DB check with a scoped foreign key, map existing rows, and closing totals use the flag. *Done 2026-11-11 with 2.2.*
- [x] **2.4 Starter procedure list** (1h). On a new clinic, the owner can one-click import ~20 common procedures (consultation, scaling, filling, RCT, extraction, crown, X-ray…) with default durations. Each **needs a price set by the owner** before it can be booked or charged. *Done 2026-11-11: 20 procedures, no prices, shown as "Price needed". The catalog is not yet linked to booking or charging, so there is nothing further to block.*

## Day 3: Money correctness and staff self-service

- [x] **3.1 Credit notes and charge correction (F3 + F5, reduced)** (6h). A credit note reduces a posted charge with a reason and `charge.credit` permission. Correction is a credit note plus a linked replacement charge. Balance = charges − credit notes − net payment allocations. Show credit notes on the account, receipts and reports; closing is not affected. *Done when:* the plan's worked examples (due 6,000 and due 5,000) pass as tests, and a verify suite covers denial, scope, replay and conflict. *Done 2026-11-11: `pnpm db:verify-credit-notes`. A credit is limited to the unpaid part of a charge; refund first to credit a paid charge.*
- [x] **3.2 Staff admin (I1)** (4h). Owner screen to invite staff by email (server-side Supabase admin invite), set role template and branch, add or remove individual permissions, and **deactivate** (blocks the next request). The owner can't deactivate themselves or remove the last owner. All audited. *Done 2026-11-11: `/team`, `pnpm db:verify-staff-admin`.*
- [x] **3.3 Final role templates (I3)** (1h). Owner, dentist, receptionist, assistant and accountant carry every permission added since the templates were written, with defaults that suit a small clinic. Document them in `docs/architecture/permissions.md`. *Done 2026-11-11: [permissions](architecture/permissions.md).*

## Day 4: Prove it is safe, then sell

- [x] **4.1 Tenant isolation suite** (3h). Two clinics with full synthetic data. For **every** `/api/v1` route, a user of clinic A using IDs from clinic B gets 404 or 403 and never data. This includes search, recent patients, receipts, refunds, reports and the timeline. Runs in CI and fails if a new route isn't covered. *Done 2026-11-11: `pnpm db:verify-tenant-isolation`, in CI.*
- [x] **4.2 Clinic timezone everywhere (R4)** (1h). One shared formatter using the clinic timezone in place of every bare `toLocaleString()`. *Done 2026-11-11: `src/lib/time.ts`; `tests/time.test.ts` fails on any bare formatter.*
- [x] **4.3 Password reset and idle timeout (I2)** (2h). Supabase reset email; sign out after 30 min idle. *Code done 2026-11-11. Needs the Supabase email templates from the operator runbook before it works end to end.*
- [ ] **4.4 Security and monitoring basics (D6 + D9, reduced)** (2h). CSP, HSTS and frame-ancestors headers; strong passwords in Supabase Auth; `pnpm audit` in CI; `/api/health`; error tracking with patient data scrubbed and clinic ID tagged; uptime alert to your phone. *Partly done 2026-11-11: security headers, `/api/health`, `pnpm audit` in CI, unhandled errors logged without patient data. Next.js and zod upgraded. Still open: strong-password setting in Supabase, error-tracking service and uptime alert (need accounts).*
- [ ] **4.5 Backup restore drill (D7, reduced)** (1.5h). Restore into a scratch project, check counts, balances and receipts, and record the time.
- [ ] **4.6 Sales kit** (2h + 👤). A **demo clinic** on production with synthetic data, clearly labelled "Demo", for showing prospects. A one-page onboarding checklist for you (create clinic → owner invite → owner sets hours, procedures, prices, methods, staff). A one-page staff quick guide with a paper procedure for outages. 👤 Terms of service and privacy policy (who owns the data: the clinic; what you can see: no patient data). *Written 2026-11-11: onboarding checklist in the [operator runbook](runbooks/operator-console.md) and the [staff quick guide](staff-quick-guide.md). Still open: demo clinic on production, terms and privacy text.*
- [ ] **4.7 First clinic** 👤. Onboard the first paying or friendly clinic using only the operator console and the checklist. If you need a script or a database query, that's a defect.

**If you fall behind,** move these to week 1 in this order: 4.4 monitoring part, 4.5, 2.4. Never cut 2.1, 3.1, 3.2 or 4.1.

---

## Defects found (fill during 1.2)

| # | Screen | Defect / clinic-specific assumption | Blocks sale? | Fixed |
|---|---|---|---|---|
| 1 | Billing | A second payment could be allocated to a charge that was already paid: the per-charge "already paid" amount was always read as zero. Account totals and balances were correct; receipts and refunds could name the wrong charge. Found by the credit-note suite | Yes | Yes, 2026-11-11 |
| 2 | Dependencies | `pnpm audit` reports critical advisories in `next` 16.3.6 (fixed in 16.4.1) and a high one in `zod` 4.6.5 (fixed in 4.6.6). Upgraded to `next` 16.4.6 and `zod` 4.6.7, and `source-map-js` pinned to 1.2.2 (via postcss). `pnpm audit --prod` is clean; two moderate advisories remain in development-only tools (drizzle-kit's esbuild, eslint's minimatch) | Yes, before deploy | Yes, 2026-11-11 |
| 3 | Local database | `pnpm db:local start` fails on this Mac unless `LC_ALL=en_US.UTF-8` is set ("postmaster became multithreaded during startup") | No | No |
| 4 | Browser | 1.2 walkthrough not done: screens behind sign-in were checked by build, types and service suites only | Yes | No |

## Post-launch backlog (priority order)

**Week 1–2 after launch (to sell to more clinics):**
1. Money race tests (F8) and an automated E2E smoke test (Q1)
2. Discounts (F2), estimate discount, validity and print (T3, T4) *Done 2026-11-14: charge discounts (`charge.discount`), estimate discount, valid-until and printable estimate.*
3. **Clinic data export** (full CSV/ZIP of a clinic's data, owner only), promised in the terms for clinics that leave
4. Clinic logo on receipts (needs the file service O1) *Done 2026-11-14 without O1: logos stored in the database, frozen per receipt.*
5. Separate staging project and release/rollback runbook (D2, D10)
6. Usage per clinic in the operator console (staff seats, patients, last activity)

**Growth features:**

7. **Per-clinic WhatsApp:** move messaging config from env vars to encrypted per-clinic settings (each clinic's own Meta number), then reminders and recalls (W1–W4). This is the strongest selling feature, but it needs this refactor first
8. Role dashboard (R1), report catalog (R2), CSV export (R3)
9. Self-serve signup with trial, landing page, online subscription payments
10. Urdu UI; Postgres row-level security as a second tenant wall
11. Expense depth (E1–E5), structured visits and tooth chart (C1–C5, O4), plan lifecycle (T1, T2, T5)
12. Stage 4 and later from the long-term roadmap

## Risks

- **4 days is tight.** The plan is ~45h. The cut line above is the safety valve.
- **👤 items set the pace.** Supabase and Vercel accounts on Day 1 morning; terms and privacy text before the first sale.
- **One production database holds every clinic.** A tenant-scoping bug leaks one clinic's patients to another. 4.1 is the guard; never skip it for a new route.
- **Restore is all-or-nothing.** PITR restores the whole database, not one clinic. Tell clients backups are platform-wide. A per-clinic restore needs the clinic data export (backlog 3).
