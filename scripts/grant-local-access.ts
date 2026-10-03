import './load-env.ts';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import { permissionCatalog } from '../src/server/auth/permissions.ts';
import { migrationEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
// Run only after explicit approval of the exact supplied permissions and verified identity.
async function main(){
 const authUserId=z.uuid().parse(process.argv[2]);const permissions=z.array(z.enum(permissionCatalog)).min(1).parse((process.argv[3]??'').split(','));
 const {MIGRATION_DATABASE_URL:url}=migrationEnvironment(process.env);requireLocalDatabase(url);const db=postgres(url,{...connectionOptions(url),max:1});
 try{await db.begin(async tx=>{await tx`select pg_advisory_xact_lock(73492002)`;
  const rows=await tx`select m.id as membership_id,m.clinic_id,b.branch_id from clinic_app.app_users u join clinic_app.memberships m on m.user_id=u.id join clinic_app.membership_branches b on b.membership_id=m.id and b.clinic_id=m.clinic_id join clinic_app.clinics c on c.id=m.clinic_id where u.auth_user_id=${authUserId} and u.active and m.active and c.name='Development Dental Clinic'`;
  if(rows.length!==1)throw new Error('Expected a single active development membership.');const scope=rows[0];
  for(const permission of new Set(permissions)){const added=await tx`insert into clinic_app.membership_grants(clinic_id,membership_id,permission) values (${scope.clinic_id},${scope.membership_id},${permission}) on conflict do nothing returning permission`;if(added.length)await tx`insert into clinic_app.audit_events(clinic_id,branch_id,actor_membership_id,action,entity_type,entity_id,request_id) values (${scope.clinic_id},${scope.branch_id},${scope.membership_id},${'development.permission.granted:'+permission},'membership',${scope.membership_id},${randomUUID()})`;}
  console.log('Explicitly approved local permissions applied and individually audited.');
 });}finally{await db.end();}
}
main().catch(()=>{console.error('Local grant failed. Check the verified identity, exact permissions and development membership. No secrets logged.');process.exitCode=1;});
