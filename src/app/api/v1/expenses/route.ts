import { getDatabase } from '@/server/db/client';
import { listExpenses, recordExpense } from '@/server/expenses/service';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const scope=await patientScope(request);const q=new URL(request.url).searchParams;return response(await listExpenses(getDatabase(),scope,{paidOn:q.get('paidOn'),offset:q.get('offset')??0}));}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response({expense:await recordExpense(getDatabase(),scope,await jsonBody(request))},201);}catch(e){return failure(e);}}
