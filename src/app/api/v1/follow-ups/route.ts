import { getDatabase } from '@/server/db/client';
import { createFollowUp,listFollowUps } from '@/server/follow-ups/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function GET(request:Request){try{return response(await listFollowUps(getDatabase(),await patientScope(request),Object.fromEntries(new URL(request.url).searchParams)));}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);return response(await createFollowUp(getDatabase(),await patientScope(request),await jsonBody(request)));}catch(e){return failure(e);}}
