'use client';
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { CalendarPlus,UserPlus,CalendarDays } from 'lucide-react';
import type { AppointmentStatus } from '@/lib/appointments/contracts';
import { api,scopeHeaders,useClinic } from './session';
import { RefreshButton } from './refresh-button';
type Overview={patients:number;appointments:Record<AppointmentStatus,number>|null};
type TrendDay={day:string;done:number;open:number};
const lengths=[7,14,30] as const;
const sum=(counts:Record<AppointmentStatus,number>|null,statuses:AppointmentStatus[])=>counts?statuses.reduce((total,status)=>total+counts[status],0):null;
const shown=(n:number|null)=>n===null?'—':new Intl.NumberFormat('en-PK').format(n);
// Numbers count up from zero once, when they first arrive; people who ask for less motion see the final number at once.
function CountUp({value}:{value:number|null}){const [shownValue,setShownValue]=useState(0);const done=useRef(false);
 useEffect(()=>{if(value===null)return;const still=window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(still||done.current||value===0){setShownValue(value);done.current=true;return;}
  let frame=0;const start=performance.now();const run=(now:number)=>{const t=Math.min(1,(now-start)/700);const eased=1-Math.pow(1-t,3);setShownValue(Math.round(value*eased));if(t<1)frame=requestAnimationFrame(run);else done.current=true;};frame=requestAnimationFrame(run);return()=>cancelAnimationFrame(frame);},[value]);
 return <>{value===null?'—':new Intl.NumberFormat('en-PK').format(shownValue)}</>;}
const greeting=(timeZone:string)=>{const h=Number(new Intl.DateTimeFormat('en-GB',{hour:'numeric',hourCycle:'h23',timeZone}).format(new Date()));return h<12?'Good morning':h<17?'Good afternoon':'Good evening';};

export function Overview(){const {scope,can}=useClinic();const [data,setData]=useState<Overview|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 useEffect(()=>{if(!can('patient.demographics.read'))return;const c=new AbortController();const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);api(`/api/v1/overview?${new URLSearchParams({startsAt:start.toISOString(),endsAt:end.toISOString()})}`,{headers:scopeHeaders(scope),signal:c.signal}).then(result=>{if(!c.signal.aborted)setData(result);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope,can,revision]);
 const today=(()=>{try{return new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:scope.timezone}).format(new Date());}catch{return '';}})();
 const canBook=can('appointment.write');const counts=data?.appointments??null;
 const inClinic=sum(counts,['arrived','waiting','in_treatment']);const expected=sum(counts,['booked','confirmed']);const done=sum(counts,['completed']);
 return <div className="staff-workspace live-inner overview">
  <div className="overview-hero">
   <div>
    <p className="overview-greeting">{greeting(scope.timezone)} · {today}</p>
    {data&&counts?<h1 className="overview-line"><span className="hero-count">{shown(inClinic)}</span> in the clinic now, <span className="hero-count">{shown(expected)}</span> still to come today</h1>:<h1 className="overview-line">Today at {scope.branchName}</h1>}
   </div>
   <div className="hero-actions">
    {canBook&&<Link href="/appointments?book=1" className="action-link primary"><CalendarPlus aria-hidden/>Book appointment</Link>}
    {can('patient.demographics.write')&&<Link href="/patients?new=1" className="action-link lime"><UserPlus aria-hidden/>Register patient</Link>}
    <RefreshButton onClick={()=>{setData(null);setError('');setRevision(v=>v+1);}} title="Reload today's numbers"/>
   </div>
  </div>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {!can('patient.demographics.read')?<section className="panel empty-state"><h2>Patient access required</h2><p>Ask the clinic owner to give your account patient access to see today’s numbers.</p></section>
  :!data&&!error?<p role="status" className="muted loading">Loading today’s numbers…</p>
  :data&&<div className="overview-grid">
   <section className="overview-main" aria-label="Today in numbers">
    <div className="stat-tiles">
     <div className="stat-tile dark"><span>In the clinic now</span><strong><CountUp value={inClinic}/></strong><small>Arrived, waiting or in the chair</small></div>
     <div className="stat-tile"><span>Still expected</span><strong><CountUp value={expected}/></strong><small>Booked or confirmed</small></div>
     <div className="stat-tile"><span>Seen today</span><strong><CountUp value={done}/></strong><small>Visits completed</small></div>
     <div className="stat-tile"><span>Registered patients</span><strong><CountUp value={data.patients}/></strong><small>Across the clinic</small></div>
    </div>
    {counts?<AppointmentChart/>:<p className="muted">Appointment numbers need calendar access on your account.</p>}
   </section>
   <aside className="overview-side">
    <div className="side-card lime">
     <span className="side-icon" aria-hidden><CalendarDays size={18}/></span>
     <h2>Today’s calendar</h2>
     <p>{counts?`${shown((inClinic??0)+(expected??0)+(done??0))} appointments on the book for today.`:'Open the calendar to see today’s bookings.'}</p>
     <Link href="/appointments" className="action-link primary">Open calendar</Link>
    </div>
    <div className="side-card">
     <h2>Quick links</h2>
     <div className="side-links">
      <Link href="/patients">Patients</Link>
      {can('billing.read')&&<Link href="/dues">Unpaid balances</Link>}
      <Link href="/follow-ups">Follow-ups &amp; recalls</Link>
      {can('billing.read')&&<Link href="/closing">Daily closing</Link>}
     </div>
    </div>
   </aside>
  </div>}
 </div>;
}

// Capsule bars: each day is a rounded track; completed visits fill from the bottom in lime, the still-open ones sit on top in ink.
function AppointmentChart(){const {scope}=useClinic();const [days,setDays]=useState<(typeof lengths)[number]>(14);const [trend,setTrend]=useState<TrendDay[]|null>(null);const [error,setError]=useState('');const [grown,setGrown]=useState(false);
 useEffect(()=>{if(!trend)return;const f=requestAnimationFrame(()=>requestAnimationFrame(()=>setGrown(true)));return()=>cancelAnimationFrame(f);},[trend]);
 useEffect(()=>{const c=new AbortController();api(`/api/v1/overview?trend=${days}`,{headers:scopeHeaders(scope),signal:c.signal}).then(r=>{if(!c.signal.aborted){setGrown(false);setTrend(r.days);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope,days]);
 const peak=Math.max(4,...(trend??[]).map(d=>d.done+d.open));const step=Math.ceil(peak/4);const top=step*4;
 const label=(day:string,short=false)=>new Intl.DateTimeFormat('en-GB',short?{day:'numeric',timeZone:'UTC'}:{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${day}T00:00:00Z`));
 const totalDone=(trend??[]).reduce((n,d)=>n+d.done,0);
 return <div className="trend">
  <div className="trend-head">
   <div><h2>Appointments</h2><p className="muted">{trend?`${totalDone} ${totalDone===1?'visit':'visits'} completed in the last ${days} days`:'Loading…'}</p></div>
   <div className="trend-tools">
    <span className="legend"><i className="dot lime"/>Completed</span><span className="legend"><i className="dot ink"/>Booked or in progress</span>
    <div className="segmented" role="group" aria-label="Chart range">{lengths.map(n=><button key={n} type="button" aria-pressed={days===n} onClick={()=>setDays(n)}>{n} days</button>)}</div>
   </div>
  </div>
  {error&&<p role="alert" className="form-error">{error}</p>}
  <div className="capsule-chart" role="img" aria-label={trend?`Appointments per day for the last ${days} days. ${totalDone} completed.`:'Loading chart'}>
   <div className="capsule-axis" aria-hidden>{[4,3,2,1,0].map(i=><span key={i}>{step*i}</span>)}</div>
   <div className={`capsule-bars n${days}`}>
    {(trend??Array.from({length:days},(_,i)=>({day:String(i),done:0,open:0}))).map((d,i,all)=>{const isToday=i===all.length-1;const every=days===30?5:days===14?2:1;return <div key={d.day} className={`capsule${isToday?' today':''}`} title={trend?`${label(d.day)}: ${d.done} completed, ${d.open} booked or in progress`:undefined}>
     <div className="capsule-track"><span className="fill-open" style={{height:grown?`${(d.open/top)*100}%`:0,transitionDelay:`${i*(days===30?12:28)}ms`}}/><span className="fill-done" style={{height:grown?`${(d.done/top)*100}%`:0,transitionDelay:`${i*(days===30?12:28)}ms`}}/></div>
     <span className="capsule-label" aria-hidden>{trend&&(isToday||(all.length-1-i)%every===0)?(isToday?'Today':label(d.day,true)):''}</span>
    </div>;})}
   </div>
  </div>
 </div>;
}
