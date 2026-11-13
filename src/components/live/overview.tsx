'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { CalendarPlus,UserPlus,CalendarDays } from 'lucide-react';
import type { AppointmentStatus } from '@/lib/appointments/contracts';
import { api,scopeHeaders,useClinic } from './session';
type Overview={patients:number;appointments:Record<AppointmentStatus,number>|null};
const sum=(counts:Record<AppointmentStatus,number>|null,statuses:AppointmentStatus[])=>counts?statuses.reduce((total,status)=>total+counts[status],0):'—';
export function Overview(){const {scope,can}=useClinic();const [data,setData]=useState<Overview|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 useEffect(()=>{if(!can('patient.demographics.read'))return;const c=new AbortController();const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);api(`/api/v1/overview?${new URLSearchParams({startsAt:start.toISOString(),endsAt:end.toISOString()})}`,{headers:scopeHeaders(scope),signal:c.signal}).then(result=>{if(!c.signal.aborted)setData(result);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope,can,revision]);
 const today=(()=>{try{return new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:scope.timezone}).format(new Date());}catch{return '';}})();
 const canBook=can('appointment.write');const noAppointments=data&&!data.appointments;
 return <div className="staff-workspace live-inner"><div className="page-heading"><div><h1>Today at {scope.branchName}</h1><p className="today-line">{today}</p></div><button className="text-button" onClick={()=>{setData(null);setError('');setRevision(v=>v+1);}}>Refresh</button></div>
 {error&&<p role="alert" className="form-error">{error}</p>}
 {!can('patient.demographics.read')?<section className="panel empty-state"><h2>Patient access required</h2><p>Ask the clinic owner to give your account patient access to see today’s numbers.</p></section>
 :!data&&!error?<p role="status" className="muted loading">Loading today’s numbers…</p>
 :data&&<div className="stats-grid" aria-label="Today in numbers">
  <div className="stat-card is-now"><strong>{sum(data.appointments,['arrived','waiting','in_treatment'])}</strong><span className="stat-label">In the clinic now</span><p>Arrived, waiting or in the chair</p></div>
  <div className="stat-card"><strong>{sum(data.appointments,['booked','confirmed'])}</strong><span className="stat-label">Still expected today</span><p>Booked or confirmed, not yet arrived</p></div>
  <div className="stat-card"><strong>{new Intl.NumberFormat('en-PK').format(data.patients)}</strong><span className="stat-label">Registered patients</span><p>Across the whole clinic</p></div>
 </div>}
 {noAppointments&&<p className="muted">Appointment numbers need calendar access on your account.</p>}
 <section className="panel live-actions"><h2>Start something</h2><p>Book a visit, register a new patient, or open today’s calendar.</p><div>{canBook&&<Link href="/appointments?book=1" className="action-link primary"><CalendarPlus aria-hidden/>Book appointment</Link>}{can('patient.demographics.write')&&<Link href="/patients?new=1" className="action-link"><UserPlus aria-hidden/>Register patient</Link>}<Link href="/appointments" className="action-link"><CalendarDays aria-hidden/>Open calendar</Link></div></section></div>;
}
