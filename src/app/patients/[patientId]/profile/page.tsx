import { PatientClinicalProfile } from '@/components/live/patient-clinical';
export default async function ProfilePage({params}:{params:Promise<{patientId:string}>}){return <div className="staff-workspace live-inner"><PatientClinicalProfile patientId={(await params).patientId}/></div>;}
