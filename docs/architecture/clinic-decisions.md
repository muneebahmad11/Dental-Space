# Clinic decision register

Created 2026-10-09 (roadmap task 0.3). These are the 15 decisions from section 10 of the [implementation plan](../../Dental_Clinic_Implementation_Plan.md). Development continues with the **development default**; a feature that depends on an open decision is not accepted for real clinic use until the decision is recorded here.

Status values: **Open** (default in use, not confirmed), **Decided** (record who, when and what), **Not needed**.

| # | Decision | Owner | Needed by (roadmap task) | Development default in use | Status | Decision record |
|---|---|---|---|---|---|---|
| D01 | Dentists, chairs, branches, staff working schedules, opening hours | Owner/reception | S1, S5, B1 | Configurable per branch; nothing pre-seeded for real use | Open | |
| D02 | Mandatory patient-card fields | Reception/dentist | P7 | Name and phone required; everything else optional | Open | |
| D03 | Tooth numbering system and adult/pediatric representation | Dentist | C1, O4 | FDI two-digit, permanent (11–48) and primary (51–85) | Open | |
| D04 | Frequent procedures, default durations, prices, starter note templates | Dentist/owner | S2, C3 | Empty procedure catalog; templates marked draft until approved | Open | |
| D05 | Discounts, refunds, deposits, partial payments | Owner/accountant | F2, F6, T3 | Discount requires permission and reason; partial payments allowed; no deposits | Open | |
| D06 | Who creates, edits and approves financial records | Owner | I3, E3, E5 | Closing approved by a different staff member than the drafter (enforced) | Open | |
| D07 | Essential medical history and consent fields | Dentist/owner | O7, W9 | Current history/allergy/medication/tobacco fields | Open | |
| D08 | Routine follow-ups and recalls | Dentist/reception | U3, W4 | Manual follow-ups only; no automatic creation | Open | |
| D09 | Messaging provider and patient consent process | Owner | W1–W6 | Meta WhatsApp Cloud API, disabled until configured; staff-recorded consent | Open | |
| D10 | Historical paper data to digitize | Owner/reception | Q4 | Active patients and verified opening balances only | Open | |
| D11 | Devices, browsers, printer, internet connection | Reception/technical lead | S9, Q3, D8 | Desktop Chrome and a tablet; browser print | Open | |
| D12 | Functions required during internet outage | Owner/dentist/technical lead | D8 | Read today's cached schedule; keep in-progress visit drafts; no offline money/booking | Open | |
| D13 | Retention, exports and authorized people | Owner (with policy advice) | Q5, R3 | No exports until approved; no deletion of records | Open | |
| D14 | Multi-branch now or later | Owner | B1 | One branch in use; schema already branch-scoped | Open | |
| D15 | Report definitions (daily/weekly/monthly) | Owner/accountant | R2, B2 | New patient = first completed visit; aging 0–30/31–60/61–90/90+ days from charge date; cash-basis summaries only | Open | |

## Other settings to confirm

| Setting | Development default | Status |
|---|---|---|
| Currency | PKR, integer paisa | Open |
| Clinic timezone | Asia/Karachi | Open |
| Business-day cutoff | Midnight clinic time | Open |
| Hosting region and budget | Not chosen (task D1) | Open |
| Recovery targets | Lose at most 1 hour; restore within 4 hours (task D7) | Open |
| Appointment status shortcuts | Booked/confirmed → arrived → waiting → in treatment → completed; arrived → in treatment allowed | Open |

When a decision is made, fill in *Decision record* with: what was decided, who decided, date, and any roadmap tasks whose scope changes.
