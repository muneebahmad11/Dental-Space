import { getDatabase } from '@/server/db/client';
import { createVisit,listVisits } from '@/server/visits/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function GET(request:Request){try{const scope=await patientScope(request);const q=new URL(request.url).searchParams;return response({visits:await listVisits(getDatabase(),scope,{patientId:q.get('patientId')??undefined,offset:q.get('offset')??0})});}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response({visit:await createVisit(getDatabase(),scope,await jsonBody(request))},201);}catch(e){return failure(e);}}
