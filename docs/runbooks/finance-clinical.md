# Finance and clinical workflow setup

Main pages use saved records. New permission definitions do not grant access to real staff. The initial development account still has its previously approved patient demographics and audit permissions only.

## Provision access deliberately

After explicit approval of exact permissions and verification of the Supabase Auth UUID, the local-only helper can add selected grants:

```sh
node --experimental-strip-types scripts/grant-local-access.ts AUTH_USER_UUID permission.one,permission.two
```

The helper requires exactly one Development Dental Clinic membership and audits each added grant. No wildcard or role-owner expansion is available. Clinical signing must be assigned to the actual authorized clinician; administrative access alone does not imply it. The helper has not been executed for new workflows.

| Workflow | Required permissions |
|---|---|
| Patient management | patient.demographics.read/write |
| Calendar | appointment.read/write plus patient.demographics.read |
| Billing/account/receipt | billing.read plus patient.demographics.read |
| Post charge | charge.post plus patient.demographics.read |
| Record payment | payment.post plus patient.demographics.read |
| Record refund | refund.post plus patient.demographics.read |
| Expenses | expense.read/write |
| Cash closing | closing.read/write; closing.approve for a different staff member |
| Clinical read | patient.clinical.read plus patient.demographics.read |
| Clinical draft | clinical read prerequisites plus visit.draft.write |
| Sign/amend | clinical read prerequisites plus visit.finalize; original visit author only |
| Communications | communication.read/send/preferences.write as appropriate, plus patient.demographics.read |

Permissions are separate; enabling one workflow does not implicitly enable another.

## Billing

Post an agreed description and exact PKR amount, then record payments already received. Payments allocate to oldest outstanding branch charges. Overpayments/deposits are rejected. Receipts retain patient/clinic labels, allocations and balance at posting. Receipt IDs provide collision-free numbers; clinic-specific sequential numbering remains a policy decision.

Refunds record money returned through the original method, cannot exceed the original payment's unrefunded amount, reverse allocations and restore receivables. They cannot predate the original payment. Refund confirmations preserve their own snapshots; original payment receipts stay unchanged. Charge credits, discounts/tax behavior and treatment item links remain open.

## Daily closing

Choose the clinic business date, enter opening float/counted cash and explain discrepancies. A different member with closing.approve reviews current totals and approves the snapshot. Expected cash = opening + recorded cash payments - cash refunds - paid cash expenses. Provider/card/bank amounts do not enter the cash drawer calculation.

Posting and approval serialize on the same branch/day advisory lock. If transactions changed since the approver's view, approval rejects and requires fresh review. Approved days reject new payments/refunds/paid expenses; operation-key retries return existing records without reposting. Cash transfers, carry-forward, reopening and final clinic approval policy remain open.

## Clinical notes

Open Clinical visits, select a saved patient and start a walk-in draft. Arrived-appointment visits can also be created by the API, with scoped patient/branch references. Save notes explicitly. Only the authoring clinician can save/sign/amend; signing requires clinical read and visit.finalize. Complaint/assessment/treatment are currently required by the development contract and need clinic validation.

Finalization creates an immutable signed revision. Amendments need a reason and create the next revision; original text remains visible. A database trigger requires the signed visit projection to match the latest immutable revision. No AI clinical content, prescribing or automatic diagnosis is generated. No offline autosave/recovery is claimed. Clinic-approved templates, patient alerts, tooth charts and treatment plans are still pending.

## Evidence

`pnpm db:verify-finance` tests partial payments, refund limits/reversal, scope denial, snapshots, atomic audit, dual approval and closed-day guards. `pnpm db:verify-visits` tests draft conflicts/authorship, finalization replay, amendments, immutable revisions/projection and revoked clinical access. Both use rollback-only synthetic data. Independent connection race tests, signed-in browser acceptance, printer checks and clinician validation remain release gates.


## Financial reports

Open `/reports` to review recorded payments, refunds and paid expenses for the selected branch and an inclusive range of up to 366 days. The endpoint is `GET /api/v1/reports/finance?from=YYYY-MM-DD&to=YYYY-MM-DD`, with the same authenticated scope headers as other staff APIs. Both `billing.read` and `expense.read` are required and rechecked on every request. No new privileges are assigned to existing accounts.

Reports use paid-on business dates and a consistent database snapshot. Daily and payment-method rows reconcile to overall totals using integer paisa. Net movement is payments minus refunds minus paid expenses; it excludes opening cash, charges, unpaid liabilities and transfers. It is not a profit statement or proof that a bank transaction cleared. Refunds are reported on their refund date, not the original payment date. Days without transactions are omitted; an empty range shows zero totals.


## Treatment estimates

`/plans` lists the latest 50 branch plans, creates estimates, saves new estimate versions and records patient/representative acceptance of the current saved version. Each item has a stable ID, description, optional tooth/site, integer quantity (1–100) and unit price in PKR; quantities and totals use integer paisa. Maximum 100 items per estimate. Earlier saved versions remain visible (latest 100).

Reading requires `patient.demographics.read`, `patient.clinical.read` and `plan.read`. Creating/revising additionally requires `plan.write`; acceptance additionally requires `plan.accept`. These permission definitions are installed without granting any actual account access. Provision only after explicit authorization. Acceptance records staff identity, patient/representative name, evidence text and timestamp. It records agreement to an estimate, not a clinical consent signature.

API routes: GET/POST `/api/v1/plans`, GET/PATCH `/api/v1/plans/:id`, POST `/api/v1/plans/:id/accept`. Writes require same-origin requests and stable UUID operation IDs. Save and acceptance require the expected current version. Changes from another operator return a conflict; reload before proceeding. Unsaved changes disable the acceptance action. Every mutation and its audit record commit together.

Accepted plans cannot be edited or returned to draft; estimate versions and acceptance records reject updates/deletes/truncation at the database layer. New proposed work needs a separate plan in this slice. Accepting a plan does not post charges, mark treatment completed or create appointments. Completion tracking, superseding accepted estimates and billing links remain open.

`pnpm db:verify-plans` uses synthetic rollback-only records to verify exact totals, version preservation, scope denial, replay/conflict behavior, audit rollback, acceptance immutability and revoked access. No real patient estimate or permission grant is created by the check.
