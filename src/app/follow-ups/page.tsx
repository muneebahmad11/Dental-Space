import { FollowUps } from '@/components/live/follow-ups';
export default async function FollowUpsPage({searchParams}:{searchParams:Promise<{visitId?:string;followUpId?:string}>}){const q=await searchParams;return <FollowUps initialVisitId={q.visitId??''} initialFollowUpId={q.followUpId??''}/>;}
