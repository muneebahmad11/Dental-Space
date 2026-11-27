# Backups and how to restore them

The live database is copied every night at 02:00 Pakistan time by the private repo
[`muneebahmad11/Dental-Space-backups`](https://github.com/muneebahmad11/Dental-Space-backups). Each copy is encrypted
with the **backup passphrase** and kept for 30 days. Nothing here touches the live database unless you choose to
restore into it (section 4).

## What is in a backup, and what is not

- **In it:** everything in the `clinic_app` and `drizzle` schemas: clinics, branches, staff memberships and
  permissions, patients, appointments, visits, plans, charges, payments, refunds, receipts, expenses, closings,
  follow-ups, settings, logos, the audit log, and the record of which migrations have run.
- **Not in it:** the sign-in accounts themselves (email and password), which Supabase keeps in its own `auth`
  schema that the backup login is not allowed to read. The app's tables keep each person's login ID, so after
  restoring into a **new** Supabase project, staff are re-linked (section 5). Restoring into the **same** project
  needs nothing: the logins are still there.
- **How old:** up to one day. Work done after last night's backup is not in it.

## 1. Check that backups are running (monthly, 2 minutes)

Open <https://github.com/muneebahmad11/Dental-Space-backups/actions>. Last night's **Nightly database backup** should
have a green tick. A failed night shows red, and GitHub emails the repo owner. One red night is not an emergency;
several in a row are: open the run and read the step that failed.

## 2. Download a backup

On the Actions page, open the run for the day you want, scroll to **Artifacts**, download
`dental-backup-YYYY-MM-DD` and unzip it. You get `dental-backup-YYYY-MM-DD.dump.gpg`.
From the terminal: `gh run download <run id> -R muneebahmad11/Dental-Space-backups`.

## 3. Decrypt it

You need the backup passphrase (password manager, offline copy, or `.local/backup-passphrase.txt` on the Mac).

```bash
gpg --decrypt --output backup.dump dental-backup-YYYY-MM-DD.dump.gpg
```

It asks for the passphrase. The result, `backup.dump`, holds patient data in readable form: keep it on your own
machine and delete it when done.

## 4. Restore

**Always try a restore into a throwaway local database first** to make sure the file is good:

```bash
createdb dental_restore_check
pg_restore --no-owner --no-privileges --exit-on-error -d dental_restore_check backup.dump
```

`.local/restore-test.sh <run id>` does the whole check automatically (download, decrypt, restore locally, compare
with live, clean up).

### a) Into the same Supabase project (after a mistake or damaged data)

This **replaces** the live clinic data with the backup's. Everything entered since that backup is lost, so be sure.

1. Tell the clinics to stop using the app.
2. Take a fresh backup of the current state first (Actions → **Nightly database backup** → **Run workflow**), so you
   can go back if needed.
3. Restore as the migration login (`MIGRATION_DATABASE_URL` from `.local/remote.secrets.json`, session pooler port 5432):
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
     --role=clinic_migrator -d "<migration database URL>" backup.dump
   ```
4. Re-grant the app's and the backup login's access, which `--no-privileges` leaves out:
   run `pnpm db:migrate --remote` (re-applies nothing, but confirms the schema) and then the grant statements in
   `drizzle/0001_runtime_privileges.sql` and the later migrations' `GRANT` lines, plus
   `GRANT SELECT ON ALL TABLES IN SCHEMA clinic_app, drizzle TO clinic_backup;`.
5. Sign in on the live site and check: clinics and branches, a patient, today's appointments, an account balance.

### b) Into a new Supabase project (if the old one is lost)

1. Create a new Supabase project (Region: Seoul), set up `clinic_migrator`, `clinic_runtime` and `clinic_backup` as
   in the first deployment (see the project's deployment notes), then restore as in (a) step 3.
2. Re-link staff (section 5).
3. Point the app at it: in Vercel set `DATABASE_URL` (runtime login, port 6543), `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the new project's values, then redeploy.
4. In the new project's Authentication → URL Configuration set the Site URL and Redirect URLs to the live address.
5. In the backups repo, update the `BACKUP_DB_PASSWORD` secret and the host/user in `backup.yml`.

## 5. Re-link staff after restoring into a new project

For each person: create their login in the new project (Authentication → Users → Add user → Create new user, tick
Auto Confirm), copy the new user's UID, then in the SQL Editor:

```sql
-- old_id is in the restored data; find it with: select id, auth_user_id, display_name from clinic_app.app_users;
update clinic_app.app_users set auth_user_id = '<new UID>' where auth_user_id = '<old UID>';
```

The person then signs in with the new login and sees exactly the clinics and branches they had before.

## The passphrase

Without it no backup can be opened, by anyone. Keep it in a password manager **and** an offline copy. If it is
lost, generate a new one, set it as the `BACKUP_PASSPHRASE` secret, and note that older backups stay locked with
the old one.
