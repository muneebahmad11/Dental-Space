import { getDatabase } from '@/server/db/client';
import { readVisit,saveVisitDraft } from '@/server/visits/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function GET(request:Request,{params}:{params:Promise<{visitId:string}>}){try{const scope=await patientScope(request);const {visitId}=await params;return response(await readVisit(getDatabase(),scope,visitId));}catch(e){return failure(e);}}
export async function PATCH(request:Request,{params}:{params:Promise<{visitId:string}>}){try{requireSameOrigin(request);const scope=await patientScope(request);const {visitId}=await params;return response({visit:await saveVisitDraft(getDatabase(),scope,visitId,await jsonBody(request,65536))});}catch(e){return failure(e);}}
