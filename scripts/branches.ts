// Adds or renames a clinic's branches until the app has its own screen for this.
//   pnpm db:branches -- --rename "Old name=New name" --add "PC Clinic" [--remote]
// Every member who can configure the clinic gets access to a new branch; other staff are given branches on the Staff page.
// Each change is written to the audit log against that clinic member. Remote databases need --remote.
import './load-env.ts';
import postgres from 'postgres';
import { connectionOptions, migrationEnvironment, requireLocalUnlessRemoteFlag } from '../src/lib/config/environment.ts';

function values(flag: string) { const out: string[] = []; process.argv.forEach((a, i) => { if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1].trim()); }); return out; }
const renames = values('--rename').map(v => { const [from, to] = v.split('=').map(s => s?.trim()); if (!from || !to) throw new Error('Use --rename "Old name=New name".'); return { from, to }; });
const adds = values('--add');
if (!renames.length && !adds.length) throw new Error('Nothing to do: pass --rename "Old=New" and/or --add "Name".');
for (const name of [...adds, ...renames.map(r => r.to)]) if (name.length < 2 || name.length > 80) throw new Error('Branch names must be 2 to 80 characters.');

const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env);
requireLocalUnlessRemoteFlag(url, process.argv);
const sql = postgres(url, { ...connectionOptions(url), max: 1 });
try {
  await sql.begin(async tx => {
    const clinics = await tx`select id, name from clinic_app.clinics order by created_at`;
    if (clinics.length !== 1) throw new Error(`Expected one clinic in this database, found ${clinics.length}. Choose the clinic before running this.`);
    const clinic = clinics[0];
    // Members who can configure the clinic, by direct grant or through a role.
    const admins = await tx`select distinct m.id from clinic_app.memberships m
      left join clinic_app.membership_grants g on g.membership_id = m.id and g.permission = 'clinic.configure'
      left join clinic_app.membership_roles mr on mr.membership_id = m.id
      left join clinic_app.role_permissions rp on rp.role_id = mr.role_id and rp.permission = 'clinic.configure'
      where m.clinic_id = ${clinic.id} and m.active and (g.permission is not null or rp.permission is not null)`;
    if (!admins.length) throw new Error('No active member can configure this clinic; nobody would be able to use a new branch.');
    const actor = admins[0].id;
    const audit = (branchId: string, action: string) => tx`insert into clinic_app.audit_events (id, clinic_id, branch_id, actor_membership_id, action, entity_type, entity_id, request_id, occurred_at)
      values (gen_random_uuid(), ${clinic.id}, ${branchId}, ${actor}, ${action}, 'branch', ${branchId}, gen_random_uuid(), now())`;
    for (const { from, to } of renames) {
      const [row] = await tx`update clinic_app.branches set name = ${to} where clinic_id = ${clinic.id} and name = ${from} returning id`;
      if (!row) throw new Error(`No branch called "${from}".`);
      await audit(row.id, 'branch.renamed'); console.log(`renamed: ${from} -> ${to}`);
    }
    for (const name of adds) {
      const [exists] = await tx`select id from clinic_app.branches where clinic_id = ${clinic.id} and name = ${name}`;
      if (exists) { console.log(`exists: ${name}`); continue; }
      const [row] = await tx`insert into clinic_app.branches (clinic_id, name) values (${clinic.id}, ${name}) returning id`;
      for (const a of admins) await tx`insert into clinic_app.membership_branches (clinic_id, membership_id, branch_id) values (${clinic.id}, ${a.id}, ${row.id}) on conflict do nothing`;
      await audit(row.id, 'branch.created'); console.log(`added: ${name} (access for ${admins.length} clinic admin${admins.length === 1 ? '' : 's'})`);
    }
    const all = await tx`select name, active from clinic_app.branches where clinic_id = ${clinic.id} order by created_at`;
    console.log(`${clinic.name}: ${all.map(b => b.name + (b.active ? '' : ' (inactive)')).join(', ')}`);
  });
} finally { await sql.end(); }
