# Milestone checklist

This tracks implementation against the technical plan; partial milestones are not marked complete. Updated 2026-10-09.

| Milestone | Current evidence and open work |
|---|---|
| M00 Decisions | Development PKR/Asia-Karachi defaults only. Clinic rules, recovery/retention and rollout decisions open. |
| M01 Foundation | Next.js, pinned dependencies, local PostgreSQL, migrations, CI configuration and Git initialization. Published to GitHub; the initial workflow CI passed. Hosted DB/staging/deployment open. |
| M02 Identity | Supabase sign-in, scoped memberships/permissions, append-only audit and denial tests. Staff administration/reset/read auditing/production hardening open. |
| M03 Patients | Durable demographics, search, registration/editing and retries. Versioned medical/dental history and active/resolved alerts implemented for selected branch. Full demographics, status and duplicate review remain open. |
| M04 Scheduling | Durable branch bookings/arrival/cancellation and serialized overlap checks. Resources/hours/week view/rescheduling/history and independent connection races open. |
| M05 Clinical | Durable draft/final revision/amendment workflow implemented with author permissions and immutable revisions; templates, chart, scheduling completion links and clinician acceptance remain open. |
| M06 Plans | Durable treatment-item estimates, immutable saved versions and version-bound patient acceptance implemented. Partial completions, remaining quantities and accepted-price billing links implemented. Completion corrections and accepted-plan revisions open. |
| M07 Finance | Manual charges, partial payment/allocation, fixed receipts, refunds/reversals, branch isolation and immutable records tested. Discounts/tax policy, charge credits, deposits and independent refund/payment race evidence open. |
| M08 Operations | Paid expenses, closing draft/separate approval, cash refund/payment/expense reconciliation and locked-day guards tested. Cash transfers, unpaid liabilities, reopening policy/approval matrix and attachment workflows open. |
| M09 Follow-up | Durable follow-ups/recalls, due-date filters, assignment, six statuses, immutable contact/status history and atomic appointment linking implemented. Permission-filtered timeline covers currently implemented modules. Reminder/recall automation, broader manual contact history and full staff journey acceptance open. |
| M10 Reports | Patient/appointment overview counts exist. Financial money-movement reports reconcile payments, refunds and paid expenses by date and method. Expanded report catalog, dashboards and staff/printer acceptance open. |
| M11 Recovery | Backups, measured restore/import and approved offline draft recovery open. |
| M12 Pilot | Staff training and controlled real clinic pilot acceptance open. |
| M13 Files | Private storage, upload validation, galleries and generated documents open. |
| M14 Clinical depth | Adult/pediatric chart, template editor, prescriptions and immutable consent open. |
| M15 Operations depth | Laboratory, inventory/lots/purchases/expiry and attachments open. |
| M16 Full reports | Expanded timeline/dashboard/catalog and selected policy rules open. |
| M17 Messaging | Meta adapter, scoped template queue, consent rechecks, signed/deduplicated webhooks, delivery history, worker leases and conservative retries tested with synthetic providers. Live Meta configuration/approved templates/HTTPS, automatic reminder/recall rules and end-to-end live delivery open. |
| M18 Portal | Patient identity isolation, online booking and digital forms open. |
| M19 Branch workflows | Scoped schemas/services tested; controlled sharing, branch jobs/exports/cache workflows open. |
| M20 Analytics/AI | Forecasting and reviewed AI need defined requirements and evaluation; open. |
| M21 Handover | Full acceptance, recovery drill and operational handover open. |

No real account receives extra privileges from schema migrations. New workflow access needs explicit provisioning approval. Live message sending is disabled by default and must not be enabled through demo seeding.
