import { SavedReceipt } from '@/components/live/billing';
export default async function Page({params}:{params:Promise<{receiptId:string}>}){const {receiptId}=await params;return <SavedReceipt key={receiptId} receiptId={receiptId}/>;}
