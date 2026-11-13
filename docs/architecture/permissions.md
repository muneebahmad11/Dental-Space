# Roles and permissions

Access is decided by database grants, never by a role name in code. Each clinic gets five starting roles when the operator creates it (`roleTemplates` in `src/server/auth/permissions.ts`). The owner then manages people on **Staff and access** (`/team`): roles, extra permissions for one person, branches, and deactivation.

A person's access is the union of their roles' permissions and their own extra permissions. There is no "deny" list: to give someone less than a role, leave the role off and tick the individual permissions.

## Starting roles

| Role | Meant for | What it can do |
|---|---|---|
| **Owner** | Clinic owner | Everything except writing or signing clinical records: patients, schedule, billing, credit notes, refunds, expenses, closing and its approval, reports, clinic settings, staff, audit log |
| **Dentist** | Treating dentists | Patient details, medical history and alerts, visit notes and signing, treatment plans (write, accept, complete), follow-ups, appointments, read-only billing and messages |
| **Receptionist** (`reception`) | Front desk | Patient details, appointments, read plans, post charges and payments, expenses, prepare the daily closing, messages and contact preferences |
| **Dental assistant** (`assistant`) | Chair-side staff | Read-only: patient details, clinical record, appointments, plans, follow-ups |
| **Accountant** | Bookkeeper | Billing, payments, refunds, expenses, closing (prepare and approve), audit log |

Decisions built into these defaults:

- **An owner who treats patients gets both Owner and Dentist.** The operator ticks "Owner also treats patients" when creating the clinic. Owner alone cannot sign a clinical note.
- **Reducing money needs the owner.** Credit notes and charge corrections (`charge.credit`) are owner-only. Refunds (`refund.post`) are owner and accountant. The receptionist can take money but not give it back or reduce a bill.
- **Discounts are decided by owners and dentists.** `charge.discount` lets someone take a discount (with a reason) off a charge as they post it. A discount agreed on an accepted estimate is applied automatically when reception bills that work, so reception needs no discount permission for it.
- **The receptionist does not see clinical notes.** Follow-up and recall lists need `patient.clinical.read`, so a clinic whose receptionist makes recall calls must add "follow-up" and "clinical read" for that person. This is deliberate: the owner makes that choice, the product does not.
- **Closing needs two people by default.** A solo clinic switches the policy in Clinic settings so the owner can approve their own count with a written note.

## Rules the database enforces

- Only someone with `user.manage` in that clinic can change staff. The app's database role cannot write memberships, roles or grants directly; it calls checked functions (`drizzle/0029_staff_admin.sql`).
- You cannot deactivate yourself, and a clinic can never lose its last active owner.
- Deactivation applies on the person's next request. Their past records and audit entries stay.
- Every change is audited by name, for example `staff.role.added:dentist`, `staff.permission.removed:refund.post`, `staff.deactivated`.
- Platform operators are not clinic members and hold no clinic permissions (see [operator console](../runbooks/operator-console.md)).

## Permission list

| Area | Permissions |
|---|---|
| Patients | `patient.demographics.read`, `patient.demographics.write`, `patient.clinical.read`, `patient.clinical.write`, `patient.archive`, `patient.duplicate.override` |
| Appointments and schedule | `appointment.read`, `appointment.write`, `appointment.override`, `appointment.duration.override`, `schedule.configure` |
| Clinical visits and plans | `visit.draft.write`, `visit.finalize`, `plan.read`, `plan.write`, `plan.accept`, `plan.complete` |
| Follow-ups and messages | `followup.read`, `followup.write`, `communication.read`, `communication.send`, `communication.preferences.write` |
| Billing and money | `billing.read`, `charge.post`, `charge.credit`, `charge.discount`, `payment.post`, `refund.post`, `expense.read`, `expense.write`, `closing.read`, `closing.write`, `closing.approve` |
| Clinic setup and staff | `clinic.configure`, `procedure.configure`, `user.manage`, `audit.read` |

Adding a permission: add it to `permissionCatalog`, insert it in a migration (and into existing `owner` roles if owners should have it), and it appears on the staff screen automatically. `tests/operator.test.ts` fails if a permission is in no group or unreachable through Owner plus Dentist.
