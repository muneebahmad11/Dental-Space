# Initial implementation decisions

- Implement the application at the existing repository root, alongside the three planning documents.
- Follow the Next.js technical plan as the architecture authority.
- Use App Router, strict TypeScript, Tailwind CSS v4 and local shadcn-compatible component source.
- The home is now an interactive demo dashboard, per the request to defer Supabase. Demo UI and fixtures are isolated under components/demo and lib/demo. Replace demo state with authorized services when identity is implemented.
- All demo edits use in-memory React state only. No localStorage, server mutations, messages or real patient data. Navigation retains state; refresh clears it.
- September 29, 2026 is the fixed demo day. Adult FDI tooth references are illustrative, not a clinic-approved numbering decision.
- Demo visit completion locks the note in client state only; this is not an immutable clinical record or an authenticated signature.
- No external font downloads are required to build the application.
- No clinic defaults or synthetic clinical records have been represented as owner-approved configuration.

## Inputs to resolve before dependent tickets

Hosting region/budget; staging Supabase project; clinic timezone/currency; mandatory patient fields; tooth numbering; approval matrix; printer format; retention/export policy; recovery targets; and approved offline data.

Foundation work can proceed without these. Clinic-specific workflows and real-data rollout require the corresponding decisions.

## Demo billing decisions

- PKR is an illustrative demo currency, not a clinic-approved configuration. UI and receipts label it explicitly. Prices can be reviewed before posting.
- Charges can be posted only for accepted/completed treatment items from completed demo visits. Each visit/item pair creates at most one charge.
- Monetary values use integer paisa; decimal inputs allow at most two decimal places and a maximum single amount of PKR 999,999.99.
- Payments allocate to the oldest outstanding charges. Reject zero, negative, malformed, fractional-paisa and over-balance payments. Deposits/refunds/credits are out of scope for this demo step.
- The in-memory ledger uses synchronous commands and stable payment request IDs to reject duplicate posting. These are demo safeguards, not substitutes for database transactions, server authorization or production idempotency.
- Receipts retain patient name, allocations and totals as of the payment. Later payments do not rewrite earlier receipts.
- Receipt pages include print CSS and a browser print action. No payment gateway, bank operation or physical printing is performed automatically.

## Demo daily operations

- Expenses are paid entries only; category and method are explicit. Immutable-in-session posting uses request IDs to avoid duplicate submission.
- Only Cash payments/expenses affect the cash drawer. Card/bank totals are visible separately, not presented as accounting profit.
- Opening cash is a manual demo input, not an automatic carry-forward. Closing snapshots opening, counted, collection/expense totals, difference and note.
- Closing requires a note for nonzero differences and blocks negative expected cash. It freezes all financial entries on the fixed demo day through shared command guards as well as disabled UI.
- Closing is a fictional session action, not authenticated manager approval. Database locking, independent approvals, corrections/reopening and durable audit remain deferred.
