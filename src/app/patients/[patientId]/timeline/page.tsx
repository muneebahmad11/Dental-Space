import { PatientTimeline } from '@/components/live/timeline';
export default async function TimelinePage({params}:{params:Promise<{patientId:string}>}){return <PatientTimeline patientId={(await params).patientId}/>;}
