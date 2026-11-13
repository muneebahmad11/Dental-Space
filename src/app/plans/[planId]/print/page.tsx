import { EstimatePrint } from '@/components/live/estimate-print';
export default async function Page({ params }: { params: Promise<{ planId: string }> }) { const { planId } = await params; return <EstimatePrint key={planId} planId={planId} />; }
