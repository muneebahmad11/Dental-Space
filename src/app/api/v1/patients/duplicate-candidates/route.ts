import { getDatabase } from '@/server/db/client';
import { duplicateCandidates } from '@/server/patients/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request){try{return response(await duplicateCandidates(getDatabase(),await patientScope(request),Object.fromEntries(new URL(request.url).searchParams)));}catch(e){return failure(e);}}
