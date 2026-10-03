import { getDatabase } from '@/server/db/client';
import { listCommunications,queueMessage } from '@/server/messaging/service';
import { messagingConfig } from '@/server/messaging/config';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const scope=await patientScope(request);const q=new URL(request.url).searchParams;return response(await listCommunications(getDatabase(),scope,{patientId:q.get('patientId')??undefined,offset:q.get('offset')??0},messagingConfig(process.env)));}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response({communication:await queueMessage(getDatabase(),scope,await jsonBody(request),messagingConfig(process.env))},201);}catch(e){return failure(e);}}
