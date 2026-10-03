import { PatientAccount } from '@/components/live/billing';
export default async function Page({params}:{params:Promise<{patientId:string}>}){const {patientId}=await params;return <PatientAccount key={patientId} patientId={patientId}/>;}
