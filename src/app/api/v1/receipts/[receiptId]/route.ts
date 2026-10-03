import { getDatabase } from '@/server/db/client';
import { getReceipt } from '@/server/finance/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request,{params}:{params:Promise<{receiptId:string}>}){try{const scope=await patientScope(request);const {receiptId}=await params;return response({receipt:await getReceipt(getDatabase(),scope,receiptId)});}catch(e){return failure(e);}}
