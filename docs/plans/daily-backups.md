# Plan: free daily backups of the live database

Status: done on 2026-11-27 (repo `muneebahmad11/Dental-Space-backups`; first backup restored and matched live). Logins are not included: Supabase refused read access to `auth`, so the restore guide covers re-linking. Cost: $0.

## Goal

Every night, an encrypted copy of the live database (Supabase project `dental-dev`) is made automatically and kept for
30 days, and anyone holding the passphrase can restore it into a fresh database by following a written guide.

**Done when** a backup made by the nightly job has been downloaded, decrypted and restored into a spare database, and
the restored copy matches the live one: same row counts, same balances, a sample patient and receipt check out.

## What we found while planning (2026-11-27)

| Fact | Effect on the plan |
|---|---|
| The GitHub repo `muneebahmad11/Dental-Space` is **public** | Backups must **not** be stored in it, even encrypted: anyone signed in to GitHub can download a public repo's Action files and read its logs. See step 0. |
| Database is 15 MB; data lives in schemas `clinic_app` and `drizzle` | A compressed, encrypted copy will be a few MB; 30 days fit easily in free storage. |
| No table uses row-level security | A plain read-only login (SELECT on every table) can copy everything. |
| Staff logins live in Supabase's own `auth` schema, not ours | The app's tables only hold each login's ID. Restoring into a *new* Supabase project needs those logins too, or staff must be re-linked. See step 2. |
| `gh` is signed in as muneebahmad11 | Secrets can be set from the terminal without pasting them anywhere. |

## Steps

### 0. Decide where backups live (your choice)

- **A. Make `Dental-Space` private (recommended).** Free. Private repos get 2,000 free Action minutes a month (the
  job needs about 1–2 a day) and 500 MB of free storage. Vercel keeps deploying as before. Side benefit: the clinic's
  code stops being public.
- **B. Keep it public and use a second, private repo** (e.g. `Dental-Space-backups`) that only runs the backup job.

### 1. Read-only backup login (me, via Supabase)

- Create role `clinic_backup`: can log in, `SELECT` on every table and sequence in `clinic_app` and `drizzle`,
  and automatic `SELECT` on tables added by future migrations (default privileges for `clinic_migrator`).
- No write, no delete, no schema changes. Password generated on the Mac; only its hash goes to Supabase.
- Check: it can read every table, and an `insert` attempt is refused.

### 2. Logins (`auth.users`)

- Try to grant `clinic_backup` read access to `auth.users` and `auth.identities` so logins are in the backup too.
- If Supabase refuses that grant, the restore guide instead covers re-linking: create each staff login in the new
  project, then point the app's `app_users` rows at the new login IDs (one SQL statement per person). With 2–5 staff
  this takes minutes.

### 3. Nightly job (me, in `.github/workflows/backup.yml`)

1. Runs every night at 02:00 Pakistan time (21:00 UTC) and on a "Run workflow" button.
2. Installs the PostgreSQL 17 client.
3. `pg_dump` of `clinic_app` and `drizzle` (plus `auth` users if step 2 allows), in PostgreSQL's custom format, with
   full certificate checks against the Supabase root certificate (public, so it can live in the repo).
4. Encrypts the file with AES-256 using `BACKUP_PASSPHRASE`; the unencrypted file never leaves the job's machine.
5. Uploads `dental-backup-YYYY-MM-DD.dump.gpg` as a 30-day artifact.
6. Fails loudly (red run, GitHub emails you) if the dump is empty or smaller than expected.

Logs print only file names and sizes, never data or connection details.

### 4. Secrets (me, with `gh secret set`, values read straight from files)

| Secret | What it is |
|---|---|
| `BACKUP_DATABASE_URL` | The read-only login's address (session pooler, port 5432) |
| `BACKUP_PASSPHRASE` | 32+ random characters, generated on the Mac into `.local/backup-passphrase.txt` |

**Your job:** copy the passphrase into your password manager **and** somewhere offline. Without it no backup can be
opened, by you or anyone. Then the `.local` copy can stay as a third copy.

### 5. First run and restore test (me)

1. Start the job by hand; confirm a green run and the artifact.
2. Download it, decrypt it with the passphrase.
3. Restore into a throwaway local PostgreSQL database.
4. Compare with live: row count of every table, total charges/payments/balances, one patient's record and one receipt.
5. Delete the throwaway database and the downloaded file.

### 6. Restore guide (me, `docs/runbooks/backup-restore.md`)

Plain steps for an emergency:
- where to find and download a given day's backup;
- how to decrypt it;
- how to restore into the same Supabase project (after a mistake) or a new one (if the project is lost), including
  logins (step 2) and pointing Vercel's `DATABASE_URL` at it;
- how to check the restore worked;
- a monthly 5-minute check: open Actions, confirm last night's run is green.

## Not in scope

- Point-in-time recovery (restoring to a minute); daily is the free-plan best.
- Backing up uploaded files: the app stores logos in the database, so they are already included.
- Keeping more than 30 days. For a longer archive, download one backup a month to your own computer or drive.

## Risks and limits

- A day's work can be lost (everything since last night's backup).
- If GitHub Actions is down one night, that night is skipped; the failure email tells you.
- If the passphrase is lost, the backups are useless. Two copies, one offline.

## Time

About one session for me. About five minutes for you: choose option A or B in step 0, and save the passphrase.
