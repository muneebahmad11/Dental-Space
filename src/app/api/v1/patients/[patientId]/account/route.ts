import { getDatabase } from '@/server/db/client';
import { patientAccount } from '@/server/finance/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request,{params}:{params:Promise<{patientId:string}>}){try{const scope=await patientScope(request);const {patientId}=await params;return response(await patientAccount(getDatabase(),scope,patientId));}catch(e){return failure(e);}}
