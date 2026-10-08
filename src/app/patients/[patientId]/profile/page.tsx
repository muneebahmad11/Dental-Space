import { PatientProfile } from '@/components/live/patient-profile';
export default async function ProfilePage({params}:{params:Promise<{patientId:string}>}){return <PatientProfile patientId={(await params).patientId}/>;}
