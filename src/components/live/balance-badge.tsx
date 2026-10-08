'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { moneyMinor } from '@/lib/finance/contracts';
import { api,scopeHeaders,useClinic } from './session';
// Read-only, branch-scoped balance for staff with billing access. Shown for information; it never blocks booking or care.
export function BalanceBadge({patientId}:{patientId:string}){
 const {scope,can}=useClinic();const allowed=can('billing.read');const [result,setResult]=useState<{patientId:string;balance:bigint|null}|null>(null);
 useEffect(()=>{if(!allowed)return;const c=new AbortController();api(`/api/v1/patients/${patientId}/account`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted)setResult({patientId,balance:BigInt(d.balanceMinor)});}).catch(()=>{if(!c.signal.aborted)setResult({patientId,balance:null});});return()=>c.abort();},[scope,patientId,allowed]);
 if(!allowed)return null;const balance=result?.patientId===patientId?result.balance:undefined;
 if(balance===undefined)return <span className="balance-badge muted">Checking balance…</span>;
 if(balance===null)return <span className="balance-badge muted">Balance unavailable</span>;
 const zero=BigInt(0);const label=balance>zero?`Balance due ${moneyMinor(balance.toString())}`:balance<zero?`In credit ${moneyMinor((-balance).toString())}`:'No balance due';
 return <span className={`balance-badge ${balance>zero?'due':''}`}>{label} · <Link href={`/accounts/${patientId}`}>Account</Link></span>;
}
