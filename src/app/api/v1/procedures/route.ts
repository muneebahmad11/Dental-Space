import { getDatabase } from '@/server/db/client';
import { createProcedure,listProcedures } from '@/server/procedures/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return response(await listProcedures(getDatabase(),await patientScope(request),Object.fromEntries(new URL(request.url).searchParams)));}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);return response(await createProcedure(getDatabase(),await patientScope(request),await jsonBody(request)),201);}catch(e){return failure(e);}}
