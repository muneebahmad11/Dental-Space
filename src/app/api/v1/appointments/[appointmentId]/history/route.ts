import { getDatabase } from '@/server/db/client';
import { appointmentHistory } from '@/server/appointments/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request,route:{params:Promise<{appointmentId:string}>}) {try {const scope=await patientScope(request); const {appointmentId}=await route.params; return response({events:await appointmentHistory(getDatabase(),scope,appointmentId)});}catch(e){return failure(e);} }
