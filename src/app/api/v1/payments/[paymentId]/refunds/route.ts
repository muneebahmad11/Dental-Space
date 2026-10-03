import { getDatabase } from '@/server/db/client';
import { postRefund } from '@/server/finance/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request,{params}:{params:Promise<{paymentId:string}>}){try{requireSameOrigin(request);const scope=await patientScope(request);const {paymentId}=await params;return response({refund:await postRefund(getDatabase(),scope,paymentId,await jsonBody(request))},201);}catch(e){return failure(e);}}
