import { getDatabase } from '@/server/db/client';
import { listRecentPatients } from '@/server/patients/recent';
import { failure,patientScope,response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return response({patients:await listRecentPatients(getDatabase(),await patientScope(request))});}catch(e){return failure(e);}}
