import { ClinicalVisit } from '@/components/live/visits';
export default async function Page({params}:{params:Promise<{visitId:string}>}){const {visitId}=await params;return <ClinicalVisit key={visitId} visitId={visitId}/>;}
