import { getDatabase } from '@/server/db/client';
import { closingSummary,saveClosingDraft,approveClosing } from '@/server/closing/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function GET(request:Request){try{const scope=await patientScope(request);return response(await closingSummary(getDatabase(),scope,new URL(request.url).searchParams.get('businessDate')));}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response({draft:await saveClosingDraft(getDatabase(),scope,await jsonBody(request))});}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response({approval:await approveClosing(getDatabase(),scope,await jsonBody(request))});}catch(e){return failure(e);}}
