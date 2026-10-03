import { getDatabase } from '@/server/db/client';
import { getRefundReceipt } from '@/server/finance/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request,{params}:{params:Promise<{refundId:string}>}){try{const scope=await patientScope(request);const {refundId}=await params;return response({receipt:await getRefundReceipt(getDatabase(),scope,refundId)});}catch(e){return failure(e);}}
