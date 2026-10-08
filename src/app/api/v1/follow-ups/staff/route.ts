import { getDatabase } from '@/server/db/client';
import { followUpStaff } from '@/server/follow-ups/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request){try{return response({staff:await followUpStaff(getDatabase(),await patientScope(request))});}catch(e){return failure(e);}}
