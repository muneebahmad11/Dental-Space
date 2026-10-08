import { FollowUps } from '@/components/live/follow-ups';
export default async function FollowUpsPage({searchParams}:{searchParams:Promise<{visitId?:string}>}){return <FollowUps initialVisitId={(await searchParams).visitId??''}/>;}
