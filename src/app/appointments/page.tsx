import { AppointmentCalendar } from '@/components/live/appointments';
type Query={book?:string;walkin?:string;patientId?:string};
// Quick Add and patient search open the calendar with a booking or walk-in form already started.
export default async function AppointmentsPage({searchParams}:{searchParams:Promise<Query>}){const q=await searchParams;const patientId=/^[0-9a-f-]{36}$/i.test(q.patientId??'')?q.patientId!:'';return <AppointmentCalendar start={q.walkin==='1'?'walk_in':q.book==='1'?'book':''} patientId={patientId}/>;}
