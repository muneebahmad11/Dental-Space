import { PatientDirectory } from '@/components/live/patients';
export default async function PatientsPage({searchParams}:{searchParams:Promise<{new?:string}>}){return <PatientDirectory startRegistration={(await searchParams).new==='1'}/>;}
