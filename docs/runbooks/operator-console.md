# Operator console and clinic onboarding

The operator (you) runs the product from `/operator`: create clinics after they pay, invite the owner, record the plan and paid-until date, suspend and reactivate. The console shows clinic-level facts only (name, status, owner invite, staff count). An operator is not a member of any clinic, so every patient, clinical and finance route refuses them. `pnpm db:verify-operator` proves this.

## One-time setup

1. Create your own user in Supabase Auth (Users → Add user) and copy its UUID.
2. `pnpm operator:grant <auth-user-uuid> "Your name"`. Today this command refuses remote databases; running it against production is part of roadmap task 1.4.
3. Sign in at `/operator`.

Environment (server-only, set in the host's settings, never committed):

| Variable | Needed | Effect |
|---|---|---|
| `SUPABASE_SECRET_KEY` | For invite emails | Sends the "choose your password" email and confirms a person's email before an invite is bound to their sign-in. Without it no email is sent, and on a remote database invites are not accepted at all |
| `SUPPORT_CONTACT` | Recommended | Shown to staff of a suspended clinic: "Subscription inactive. Contact …" |

Supabase project settings that this design relies on:

- **Turn off public sign-ups.** Access comes only from invites.
- **Keep email confirmation on.**
- **Email templates → Invite user and Reset password:** point the link at the app, not the default Supabase URL:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (use `type=recovery` in the reset template). Set Site URL to the app's exact origin.
- Under Auth → Sessions, set an inactivity timeout if your plan allows. The app also signs people out in the browser after 30 minutes without activity.

## Onboarding a clinic (about 5 minutes)

1. **Create the clinic** in the console: name, city, phone, first branch name, owner name and email, plan note, paid-until. Tick "Owner also treats patients" for a dentist-owner. Currency is PKR and the timezone defaults to Asia/Karachi.
2. **The owner gets an email**, chooses a password and signs in. Their first sign-in binds the invite. The console shows "signed in" when it worked. If the email did not arrive, use Manage → Send owner invite again, or ask them to press "Forgot password" on the sign-in page.
3. **The owner sets up the clinic themselves**, in this order:
   - Clinic settings: address, phone, receipt header and footer, NTN, payment methods, and the closing rule (solo clinics choose "owner may approve own closing").
   - Schedule setup: opening hours, dentists, chairs, holidays.
   - Procedures: "Add common procedures", then set a price on each.
   - Staff and access: invite the receptionist and dentists and choose their roles.
4. **Check with the owner:** book a test appointment, post a charge, take a payment, print the receipt, close the day.

If any step needs a script or a database query, that is a product defect: write it in the roadmap's defect table.

## Suspending for non-payment

Suspend in the console. From their next request every staff member sees "Subscription inactive" and no route answers. Nothing is deleted. Reactivate restores access at once. Both actions, and every plan or paid-until change, are in the clinic's operator history, which cannot be edited.

## How it is protected

- The app's database role cannot write clinics, branches, memberships or roles. Operator actions and invite acceptance go through checked database functions (`drizzle/0026_operator_console.sql`) that verify the caller and write the audit record in the same transaction.
- Every staff API request first checks active membership and clinic status (`assertStaffAccess` in `patientScope`), before reading any input.
- `pnpm db:verify-tenant-isolation` attacks one clinic from another through every staff service and fails CI when a new route is not covered.
