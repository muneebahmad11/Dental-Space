import { getDatabase } from '@/server/db/client';
import { signVisit } from '@/server/visits/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request,{params}:{params:Promise<{visitId:string}>}){try{requireSameOrigin(request);const scope=await patientScope(request);const {visitId}=await params;return response({revision:await signVisit(getDatabase(),scope,visitId,await jsonBody(request))});}catch(e){return failure(e);}}
