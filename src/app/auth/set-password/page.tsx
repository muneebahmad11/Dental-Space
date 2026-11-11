import { SetPassword } from '@/components/live/set-password';
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) { return <SetPassword expired={(await searchParams).link === 'expired'} />; }
