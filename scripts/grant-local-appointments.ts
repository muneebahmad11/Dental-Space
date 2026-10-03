import './load-env.ts';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import { migrationEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
// Execute only after explicit approval for appointment.read and appointment.write.
async function main(){
  const id=z.uuid().parse(process.argv[2]);const {MIGRATION_DATABASE_URL:url}=migrationEnvironment(process.env);requireLocalDatabase(url);
  const db=postgres(url,{...connectionOptions(url),max:1});
  try {await db.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(73492002)`;
    const scopes=await tx`select m.id as membership_id,m.clinic_id,b.branch_id from clinic_app.app_users u join clinic_app.memberships m on m.user_id=u.id join clinic_app.membership_branches b on b.membership_id=m.id join clinic_app.clinics c on c.id=m.clinic_id where u.auth_user_id=${id} and u.active and m.active and c.name='Development Dental Clinic'`;
    if(scopes.length!==1)throw new Error('Expected one development membership.');const s=scopes[0];
    let changed=false;
    for(const permission of ['appointment.read','appointment.write']){const rows=await tx`insert into clinic_app.membership_grants(clinic_id,membership_id,permission) values (${s.clinic_id},${s.membership_id},${permission}) on conflict do nothing returning permission`;changed ||= rows.length>0;}
    if(changed)await tx`insert into clinic_app.audit_events(clinic_id,branch_id,actor_membership_id,action,entity_type,entity_id,request_id) values (${s.clinic_id},${s.branch_id},${s.membership_id},'development.appointment_permissions.granted','membership',${s.membership_id},${randomUUID()})`;
    console.log('Approved local appointment permissions applied; changes audited.');
  });}finally{await db.end();}
}
main().catch(()=>{console.error('Local appointment grant failed. Check identity and development membership.');process.exitCode=1;});
