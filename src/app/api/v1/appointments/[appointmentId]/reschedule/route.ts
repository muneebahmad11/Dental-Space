import { getDatabase } from '@/server/db/client';
import { rescheduleAppointment } from '@/server/appointments/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request,route:{params:Promise<{appointmentId:string}>}) {try {requireSameOrigin(request); const scope=await patientScope(request); const {appointmentId}=await route.params; return response({appointment:await rescheduleAppointment(getDatabase(),scope,appointmentId,await jsonBody(request))});}catch(e){return failure(e);} }
