import { getDatabase } from '@/server/db/client';
import { readContactPreferences,saveContactPreferences } from '@/server/patient-profile/contact';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
type Context={params:Promise<{patientId:string}>};
export async function GET(request:Request,{params}:Context){try{return response(await readContactPreferences(getDatabase(),await patientScope(request),(await params).patientId));}catch(e){return failure(e);}}
export async function PUT(request:Request,{params}:Context){try{requireSameOrigin(request);return response(await saveContactPreferences(getDatabase(),await patientScope(request),(await params).patientId,await jsonBody(request)));}catch(e){return failure(e);}}
