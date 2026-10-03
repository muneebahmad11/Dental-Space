import { getDatabase } from '@/server/db/client';
import { cancelMessage } from '@/server/messaging/service';
import { failure,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function DELETE(request:Request,{params}:{params:Promise<{communicationId:string}>}){try{requireSameOrigin(request);const scope=await patientScope(request);const {communicationId}=await params;return response({communication:await cancelMessage(getDatabase(),scope,communicationId)});}catch(e){return failure(e);}}
