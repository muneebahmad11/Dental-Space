import { SavedReceipt } from '@/components/live/billing';
export default async function Page({params}:{params:Promise<{refundId:string}>}){const {refundId}=await params;return <SavedReceipt key={refundId} receiptId={refundId} kind="refund"/>;}
