// Makes a separate copy of a clinic's setup, without any patients, appointments or money.
//   pnpm db:copy-clinic -- --from "Ahmad Dental Surgery" --name "Ahmad Dental Surgery (Practice)" [--remote]
// Copied: clinic details and receipt text, message templates, logo, payment methods, roles, the same staff with the same
// permissions and branch access, branches, opening hours, chairs, active doctors and active procedures with prices.
// Clinic-level rows are created in one transaction; calendars and the procedure list then go through the app's own
// services, so they carry the same versions and audit records as if staff had set them up by hand.
import './load-env.ts';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { connectionOptions, migrationEnvironment, requireLocalUnlessRemoteFlag, runtimeEnvironment } from '../src/lib/config/environment.ts';
import { createScheduleResource, saveOpeningHours } from '../src/server/scheduling/settings.ts';
import { createProcedure } from '../src/server/procedures/service.ts';
import type { WeeklyHours } from '../src/lib/scheduling/contracts.ts';

const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1]?.trim() : undefined; };
const from = arg('--from'); const name = arg('--name');
if (!from || !name) throw new Error('Use --from "Existing clinic" --name "New clinic name".');
if (name.length < 2 || name.length > 120) throw new Error('The new clinic name must be 2 to 120 characters.');

const { MIGRATION_DATABASE_URL: adminUrl } = migrationEnvironment(process.env);
const { DATABASE_URL: runtimeUrl } = runtimeEnvironment(process.env);
requireLocalUnlessRemoteFlag(adminUrl, process.argv); requireLocalUnlessRemoteFlag(runtimeUrl, process.argv);
const admin = postgres(adminUrl, { ...connectionOptions(adminUrl), max: 1 });
const runtime = postgres(runtimeUrl, { ...connectionOptions(runtimeUrl), max: 1 });
const db = drizzle(runtime) as never;
const op = () => randomUUID();

try {
  // 1. Clinic-level setup, all or nothing.
  const made = await admin.begin(async tx => {
    const [source] = await tx`select * from clinic_app.clinics where name = ${from}`;
    if (!source) throw new Error(`No clinic called "${from}".`);
    const [taken] = await tx`select 1 from clinic_app.clinics where name = ${name}`;
    if (taken) throw new Error(`A clinic called "${name}" already exists; nothing was changed.`);
    const [clinic] = await tx`insert into clinic_app.clinics (name, currency, timezone, status, city, phone, plan_note, paid_until, address, receipt_header, receipt_footer, ntn, closing_approval_policy, message_templates)
      values (${name}, ${source.currency}, ${source.timezone}, ${source.status}, ${source.city}, ${source.phone}, ${source.plan_note}, ${source.paid_until}, ${source.address}, ${source.receipt_header}, ${source.receipt_footer}, ${source.ntn}, ${source.closing_approval_policy}, ${source.message_templates}) returning id`;
    // Payment methods: the clinic trigger seeds the defaults; make the list match the source exactly.
    await tx`delete from clinic_app.clinic_payment_methods where clinic_id = ${clinic.id}`;
    await tx`insert into clinic_app.clinic_payment_methods (clinic_id, name, is_cash, active, sort_order) select ${clinic.id}, name, is_cash, active, sort_order from clinic_app.clinic_payment_methods where clinic_id = ${source.id}`;
    const branchMap = new Map<string, string>();
    for (const b of await tx`select id, name from clinic_app.branches where clinic_id = ${source.id} and active order by created_at`) {
      const [nb] = await tx`insert into clinic_app.branches (clinic_id, name) values (${clinic.id}, ${b.name}) returning id`; branchMap.set(b.id, nb.id);
    }
    if (!branchMap.size) throw new Error('The source clinic has no active branch.');
    const roleMap = new Map<string, string>();
    for (const r of await tx`select id, name from clinic_app.roles where clinic_id = ${source.id}`) {
      const [nr] = await tx`insert into clinic_app.roles (clinic_id, name) values (${clinic.id}, ${r.name}) returning id`; roleMap.set(r.id, nr.id);
      await tx`insert into clinic_app.role_permissions (clinic_id, role_id, permission) select ${clinic.id}, ${nr.id}, permission from clinic_app.role_permissions where role_id = ${r.id}`;
    }
    const members: { authUserId: string; membershipId: string }[] = [];
    for (const m of await tx`select m.id, m.user_id, a.auth_user_id from clinic_app.memberships m join clinic_app.app_users a on a.id = m.user_id where m.clinic_id = ${source.id} and m.active`) {
      const [nm] = await tx`insert into clinic_app.memberships (clinic_id, user_id) values (${clinic.id}, ${m.user_id}) returning id`;
      await tx`insert into clinic_app.membership_grants (clinic_id, membership_id, permission) select ${clinic.id}, ${nm.id}, permission from clinic_app.membership_grants where membership_id = ${m.id}`;
      for (const mr of await tx`select role_id from clinic_app.membership_roles where membership_id = ${m.id}`) await tx`insert into clinic_app.membership_roles (clinic_id, membership_id, role_id) values (${clinic.id}, ${nm.id}, ${roleMap.get(mr.role_id)!})`;
      for (const mb of await tx`select branch_id from clinic_app.membership_branches where membership_id = ${m.id}`) { const nb = branchMap.get(mb.branch_id); if (nb) await tx`insert into clinic_app.membership_branches (clinic_id, membership_id, branch_id) values (${clinic.id}, ${nm.id}, ${nb})`; }
      members.push({ authUserId: m.auth_user_id, membershipId: nm.id });
    }
    if (!members.length) throw new Error('The source clinic has no active staff to copy.');
    const firstBranch = [...branchMap.values()][0];
    await tx`insert into clinic_app.audit_events (id, clinic_id, branch_id, actor_membership_id, action, entity_type, entity_id, request_id, occurred_at)
      values (gen_random_uuid(), ${clinic.id}, ${firstBranch}, ${members[0].membershipId}, 'clinic.copied', 'clinic', ${clinic.id}, gen_random_uuid(), now())`;
    return { sourceId: source.id as string, sourceLogo: source.logo_id as string | null, clinicId: clinic.id as string, branchMap, members };
  });

  // 2. Logo: copied byte for byte, if the source has one.
  if (made.sourceLogo) {
    const cols = (await admin`select column_name from information_schema.columns where table_schema = 'clinic_app' and table_name = 'clinic_logos' and column_name not in ('id', 'clinic_id', 'created_at') order by ordinal_position`).map(c => c.column_name as string);
    const list = admin.unsafe(cols.map(c => `"${c}"`).join(', '));
    const [logo] = await admin`insert into clinic_app.clinic_logos (clinic_id, ${list}) select ${made.clinicId}, ${list} from clinic_app.clinic_logos where id = ${made.sourceLogo} returning id`;
    await admin`update clinic_app.clinics set logo_id = ${logo.id} where id = ${made.clinicId}`;
  }

  // 3. Per branch: hours, chairs and doctors through the scheduling service, as the copied owner.
  const owner = made.members[0].authUserId;
  for (const [sourceBranch, branchId] of made.branchMap) {
    const scope = { authUserId: owner, clinicId: made.clinicId, branchId };
    const [hours] = await admin`select slot_minutes, weekly_hours from clinic_app.branch_schedule_settings where branch_id = ${sourceBranch}`;
    if (hours) await saveOpeningHours(db, scope, { operationId: op(), expectedVersion: 0, slotMinutes: hours.slot_minutes, weeklyHours: hours.weekly_hours as WeeklyHours });
    for (const c of await admin`select name from clinic_app.schedule_chairs where branch_id = ${sourceBranch} and active order by name`) await createScheduleResource(db, scope, { kind: 'chair', operationId: op(), name: c.name });
    for (const d of await admin`select name, color from clinic_app.schedule_dentists where branch_id = ${sourceBranch} and active order by name`) await createScheduleResource(db, scope, { kind: 'dentist', operationId: op(), name: d.name, color: d.color, membershipId: null });
  }

  // 4. Procedures: the clinic-wide price list, active entries only.
  const anyBranch = [...made.branchMap.values()][0];
  const price = (minor: number | null) => minor === null ? null : (minor % 100 ? (minor / 100).toFixed(2) : String(minor / 100));
  for (const p of await admin`select code, name, category, default_minutes, price_minor from clinic_app.procedures where clinic_id = ${made.sourceId} and active order by name`)
    await createProcedure(db, { authUserId: owner, clinicId: made.clinicId, branchId: anyBranch }, { operationId: op(), code: p.code, name: p.name, category: p.category, defaultMinutes: p.default_minutes, price: price(p.price_minor) });

  // Summary.
  const [summary] = await admin`select c.name,
    (select string_agg(b.name, ', ' order by b.created_at) from clinic_app.branches b where b.clinic_id = c.id) as branches,
    (select count(*) from clinic_app.schedule_dentists d where d.clinic_id = c.id and d.active)::int as doctors,
    (select count(*) from clinic_app.schedule_chairs s where s.clinic_id = c.id and s.active)::int as chairs,
    (select count(*) from clinic_app.procedures p where p.clinic_id = c.id)::int as procedures,
    (select count(*) from clinic_app.memberships m where m.clinic_id = c.id)::int as staff,
    (select count(*) from clinic_app.patients p where p.clinic_id = c.id)::int as patients
    from clinic_app.clinics c where c.id = ${made.clinicId}`;
  console.log(`Created ${summary.name}: branches ${summary.branches}; ${summary.doctors} doctor calendars, ${summary.chairs} chairs, ${summary.procedures} procedures, ${summary.staff} staff, ${summary.patients} patients.`);
} finally { await admin.end(); await runtime.end(); }
