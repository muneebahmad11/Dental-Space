import { getDatabase } from '@/server/db/client';
import { readPatientProfile,savePatientProfile } from '@/server/patient-profile/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
type Context={params:Promise<{patientId:string}>};
export async function GET(request:Request,{params}:Context){try{return response(await readPatientProfile(getDatabase(),await patientScope(request),(await params).patientId));}catch(e){return failure(e);}}
export async function POST(request:Request,{params}:Context){try{requireSameOrigin(request);return response(await savePatientProfile(getDatabase(),await patientScope(request),(await params).patientId,await jsonBody(request)));}catch(e){return failure(e);}}
