import { TreatmentPlans } from '@/components/live/plans';
export default async function PlansPage({searchParams}:{searchParams:Promise<{planId?:string}>}){return <TreatmentPlans initialPlanId={(await searchParams).planId??''}/>;}
