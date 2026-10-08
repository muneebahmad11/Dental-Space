'use client';
import { BalanceBadge } from './balance-badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode } from 'react';
import { bookingSources,reschedulableStatuses,sourceLabels,statusLabels,transitionNeedsNote,transitions,visitStartStatuses,type AppointmentStatus } from '@/lib/appointments/contracts';
import { businessDate } from '@/lib/finance/contracts';
import { addDays,clockMinutes,clockOf,localParts,minutesToClock,weekStart,weekdayLabels,zonedInstant,type WeeklyHours } from '@/lib/scheduling/contracts';
import { api,scopeHeaders,useClinic } from './session';
type Appointment={id:string;patientId:string;patientName:string;patientDisplayId:string;startsAt:string;endsAt:string;status:AppointmentStatus;version:number;dentistId:string|null;dentistName:string|null;dentistColor:string|null;chairId:string|null;chairName:string|null;procedureId:string|null;procedureName:string|null;reason:string;notes:string;nextAction:string;source:typeof bookingSources[number];overrideReason:string|null};
type Dentist={id:string;name:string;color:string;active:boolean};
type Chair={id:string;name:string;active:boolean};
type Settings={timezone:string;today:string;dentists:Dentist[];chairs:Chair[];hours:{slotMinutes:number;weeklyHours:WeeklyHours}|null;closures:{closedOn:string;reason:string}[]};
type Procedure={id:string;name:string;defaultMinutes:number};
type Draft={kind:'book';date:string;time:string;dentistId:string;patientId?:string}|{kind:'walk_in';patientId?:string};
const actionLabels:Partial<Record<AppointmentStatus,string>>={confirmed:'Confirm',arrived:'Mark arrived',waiting:'Move to waiting',in_treatment:'Start treatment',completed:'Mark completed',cancelled:'Cancel booking',no_show:'Mark no-show'};
const pxPerMinute=1.6;
// One operation key per unchanged request, so an ambiguous network failure can be retried without double booking.
function useCommand(){
 const {scope}=useClinic();const [busy,setBusy]=useState(false);const [error,setError]=useState<{message:string;code:string}|null>(null);const operation=useRef<{id:string;payload:string}|null>(null);
 async function send<T>(url:string,method:string,values:Record<string,unknown>,done:(data:T)=>void){
  if(busy)return;const payload=JSON.stringify({url,method,...values});if(operation.current&&operation.current.payload!==payload)operation.current=null;operation.current??={id:crypto.randomUUID(),payload};
  setBusy(true);setError(null);
  try{const data=await api(url,{method,headers:scopeHeaders(scope),body:JSON.stringify({...values,operationId:operation.current.id})});operation.current=null;done(data as T);}
  catch(e){if(e instanceof Error&&'status' in e&&Number(e.status)>=400&&Number(e.status)<500)operation.current=null;setError({message:e instanceof Error?e.message:'The request could not be completed.',code:e instanceof Error&&'code' in e?String(e.code):''});}
  finally{setBusy(false);}
 }
 return {busy,error,setError,send};
}
export function Calendar({start='',patientId=''}:{start?:''|'book'|'walk_in';patientId?:string}){
 const {scope,can}=useClinic();const canWrite=can('appointment.write');
 const [settings,setSettings]=useState<Settings|null>(null);const [procedures,setProcedures]=useState<Procedure[]>([]);const [rows,setRows]=useState<Appointment[]|null>(null);
 const [view,setView]=useState<'day'|'week'>('day');const [date,setDate]=useState('');const [dentistFilter,setDentistFilter]=useState('');
 const [selected,setSelected]=useState('');const [draft,setDraft]=useState<Draft|null>(start==='walk_in'?{kind:'walk_in',patientId}:start==='book'?{kind:'book',date:'',time:'',dentistId:'',patientId}:null);const [revision,setRevision]=useState(0);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 useEffect(()=>{const c=new AbortController();Promise.all([api('/api/v1/schedule/settings',{headers:scopeHeaders(scope),signal:c.signal}),api('/api/v1/procedures',{headers:scopeHeaders(scope),signal:c.signal})]).then(([s,p])=>{if(c.signal.aborted)return;setSettings(s);setProcedures(p.items);setDate(d=>d||s.today);setDraft(d=>d?.kind==='book'&&!d.date?{...d,date:s.today}:d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope]);
 const timezone=settings?.timezone??scope.timezone;const from=view==='day'?date:date&&weekStart(date);const days=view==='day'?1:7;
 useEffect(()=>{if(!date)return;const c=new AbortController();const query=new URLSearchParams({startsAt:zonedInstant(timezone,from,'00:00').toISOString(),endsAt:zonedInstant(timezone,addDays(from,days),'00:00').toISOString(),...(dentistFilter?{dentistId:dentistFilter}:{})});api(`/api/v1/appointments?${query}`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted){setRows(d.appointments);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope,timezone,from,days,dentistFilter,date,revision]);
 const refresh=(message='')=>{setNotice(message);setRevision(n=>n+1);};
 const move=(n:number)=>{setRows(null);setDate(d=>addDays(d,n*days));};
 const current=rows?.find(r=>r.id===selected)??null;
 if(!settings||!date)return <section role="status">{error?<p role="alert" className="staff-error">{error}</p>:<p>Loading the calendar…</p>}</section>;
 const activeDentists=settings.dentists.filter(d=>d.active);const closure=settings.closures.find(c=>c.closedOn===date);
 return <div className="calendar-shell">
  <div className="cal-toolbar">
   <div className="cal-nav"><button className="secondary" onClick={()=>move(-1)} aria-label={`Previous ${view}`}>‹</button><button className="secondary" onClick={()=>{setRows(null);setDate(businessDate(timezone));}}>Today</button><button className="secondary" onClick={()=>move(1)} aria-label={`Next ${view}`}>›</button>
    <label className="sr-only" htmlFor="cal-date">Date</label><input id="cal-date" type="date" value={date} onChange={e=>{if(e.target.value){setRows(null);setDate(e.target.value);}}}/></div>
   <div className="cal-nav"><div className="segmented" role="group" aria-label="Calendar view">{(['day','week'] as const).map(v=><button key={v} className={view===v?'':'secondary'} aria-pressed={view===v} onClick={()=>{setRows(null);setView(v);}}>{v==='day'?'Day':'Week'}</button>)}</div>
    {activeDentists.length>0&&<><label className="sr-only" htmlFor="cal-dentist">Dentist</label><select id="cal-dentist" value={dentistFilter} onChange={e=>{setRows(null);setDentistFilter(e.target.value);}}><option value="">All dentists</option>{activeDentists.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></>}
    <button className="secondary" onClick={()=>refresh()}>Refresh</button>
    {canWrite&&<><button onClick={()=>{setSelected('');setDraft({kind:'book',date,time:'',dentistId:dentistFilter});}}>New booking</button><button className="secondary" onClick={()=>{setSelected('');setDraft({kind:'walk_in'});}}>Walk-in</button></>}</div>
  </div>
  <p className="cal-caption">{view==='day'?`${weekdayLabels[localParts('UTC',new Date(`${date}T12:00:00Z`)).weekday]} ${date}`:`Week of ${from}`} · Clinic time ({timezone}){!settings.hours&&' · Opening hours not configured'}{activeDentists.length===0&&<> · <Link href="/schedule-setup">Add dentist calendars</Link></>}</p>
  {closure&&view==='day'&&<p role="status" className="cal-closed">Branch closed: {closure.reason}</p>}
  {error&&<p role="alert" className="staff-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className={`cal-layout ${current||draft?'with-panel':''}`}>
   <div className="cal-main">{!rows?<p role="status">Loading appointments…</p>:view==='day'?<DayGrid date={date} settings={settings} rows={rows} dentists={dentistFilter?activeDentists.filter(d=>d.id===dentistFilter):activeDentists} selected={selected} onSelect={id=>{setDraft(null);setSelected(id);}} onSlot={canWrite?(time,dentistId)=>{setSelected('');setDraft({kind:'book',date,time,dentistId});}:undefined}/>:<WeekView from={from} timezone={timezone} rows={rows} closures={settings.closures} onSelect={id=>{setDraft(null);setSelected(id);}} onDay={d=>{setRows(null);setView('day');setDate(d);}}/>}</div>
   {(current||draft)&&<aside className="cal-panel">
    {draft?.kind==='book'&&<BookingForm key={`${draft.date}${draft.time}${draft.dentistId}`} draft={draft} patientId={draft.patientId} settings={settings} procedures={procedures} onClose={()=>setDraft(null)} onSaved={(id,message)=>{setDraft(null);setSelected(id);refresh(message);}}/>}
    {draft?.kind==='walk_in'&&<WalkInForm patientId={draft.patientId} settings={settings} procedures={procedures} onClose={()=>setDraft(null)} onSaved={id=>{setDraft(null);setDate(settings.today);setView('day');setSelected(id);refresh('Walk-in recorded as arrived.');}}/>}
    {current&&!draft&&<AppointmentPanel key={`${current.id}:${current.version}`} row={current} settings={settings} procedures={procedures} onClose={()=>setSelected('')} onChanged={message=>refresh(message)}/>}
   </aside>}
  </div>
 </div>;
}
// Overlapping bookings (allowed only by override or walk-in) are laid out side by side.
function lanes(items:Appointment[]){const sorted=[...items].sort((a,b)=>+new Date(a.startsAt)-+new Date(b.startsAt));const ends:number[]=[];const lane=new Map<string,number>();for(const r of sorted){let i=ends.findIndex(e=>e<=+new Date(r.startsAt));if(i<0){i=ends.length;ends.push(0);}ends[i]=+new Date(r.endsAt);lane.set(r.id,i);}return {lane,count:Math.max(1,ends.length)};}
function DayGrid({date,settings,rows,dentists,selected,onSelect,onSlot}:{date:string;settings:Settings;rows:Appointment[];dentists:Dentist[];selected:string;onSelect:(id:string)=>void;onSlot?:(time:string,dentistId:string)=>void}){
 const tz=settings.timezone;const weekday=localParts('UTC',new Date(`${date}T12:00:00Z`)).weekday;const periods=settings.hours?.weeklyHours[weekday]??[];const slot=settings.hours?.slotMinutes??15;
 const local=(v:string)=>{const p=localParts(tz,new Date(v));return p.date===date?p.minute:p.date<date?0:24*60;};
 let start=periods.length?Math.min(...periods.map(p=>clockMinutes(p[0]))):8*60;let end=periods.length?Math.max(...periods.map(p=>clockMinutes(p[1]))):20*60;
 for(const r of rows){start=Math.min(start,Math.floor(local(r.startsAt)/60)*60);end=Math.max(end,Math.ceil(local(r.endsAt)/60)*60);}
 const open=(m:number)=>!settings.hours||periods.some(([a,b])=>m>=clockMinutes(a)&&m<clockMinutes(b));
 const closed=settings.closures.some(c=>c.closedOn===date);
 const columns:{id:string;name:string;color:string}[]=dentists.length?dentists.map(d=>({id:d.id,name:d.name,color:d.color})):[{id:'',name:'Branch calendar',color:'#185d55'}];
 if(dentists.length&&rows.some(r=>!r.dentistId||!dentists.some(d=>d.id===r.dentistId)))columns.push({id:'other',name:'Other / unassigned',color:'#7b9090'});
 const columnOf=(r:Appointment)=>dentists.length?(dentists.some(d=>d.id===r.dentistId)?r.dentistId!:'other'):'';
 const slots=Array.from({length:Math.ceil((end-start)/slot)},(_,i)=>start+i*slot);const height=(end-start)*pxPerMinute;
 return <div className="cal-scroll"><div className="cal-day" style={{gridTemplateColumns:`56px repeat(${columns.length},minmax(150px,1fr))`}}>
  <div className="cal-head"/>{columns.map(c=><div key={c.id} className="cal-head"><span className="color-dot" style={{background:c.color}}/>{c.name}</div>)}
  <div className="cal-gutter" style={{height}}>{slots.filter(m=>m%60===0).map(m=><span key={m} style={{top:(m-start)*pxPerMinute}}>{minutesToClock(m)}</span>)}</div>
  {columns.map(c=>{const items=rows.filter(r=>columnOf(r)===c.id);const {lane,count}=lanes(items.filter(r=>r.status!=='cancelled'&&r.status!=='no_show'));return <div key={c.id} className="cal-column" style={{height}}>
   {slots.map(m=><button key={m} type="button" className={`cal-slot ${open(m)&&!closed?'':'cal-slot-closed'} ${m%60===0?'cal-hour':''}`} style={{top:(m-start)*pxPerMinute,height:slot*pxPerMinute}} disabled={!onSlot||c.id==='other'} aria-label={`Book ${minutesToClock(m)}${c.id&&c.id!=='other'?` with ${c.name}`:''}`} onClick={()=>onSlot?.(minutesToClock(m),c.id==='other'?'':c.id)}/>)}
   {items.map(r=>{const top=(local(r.startsAt)-start)*pxPerMinute;const h=Math.max(18,(local(r.endsAt)-local(r.startsAt))*pxPerMinute-2);const inactive=r.status==='cancelled'||r.status==='no_show';const l=inactive?0:lane.get(r.id)??0;const w=inactive?100:100/count;
    return <button key={r.id} type="button" className={`cal-appt appt-${r.status} ${selected===r.id?'selected':''}`} style={{top,height:h,left:`calc(${l*w}% + 2px)`,width:`calc(${w}% - 4px)`,borderLeftColor:r.dentistColor??c.color}} onClick={()=>onSelect(r.id)}>
     <strong>{r.patientName}</strong><span>{clockOf(tz,r.startsAt)}–{clockOf(tz,r.endsAt)}{r.procedureName?` · ${r.procedureName}`:r.reason?` · ${r.reason}`:''}</span><span className="appt-chip">{r.source==='walk_in'?'Walk-in · ':''}{statusLabels[r.status]}{r.overrideReason?' · override':''}</span></button>;})}
  </div>;})}
 </div></div>;
}
function WeekView({from,timezone,rows,closures,onSelect,onDay}:{from:string;timezone:string;rows:Appointment[];closures:{closedOn:string;reason:string}[];onSelect:(id:string)=>void;onDay:(date:string)=>void}){
 return <div className="cal-week">{Array.from({length:7},(_,i)=>addDays(from,i)).map(d=>{const items=rows.filter(r=>localParts(timezone,new Date(r.startsAt)).date===d);const closure=closures.find(c=>c.closedOn===d);const active=items.filter(r=>r.status!=='cancelled'&&r.status!=='no_show').length;
  return <div key={d} className="cal-week-day"><button type="button" className="cal-week-head" onClick={()=>onDay(d)}><strong>{weekdayLabels[localParts('UTC',new Date(`${d}T12:00:00Z`)).weekday].slice(0,3)} {d.slice(8)}</strong><span>{active} booked</span></button>{closure&&<p className="cal-closed">Closed: {closure.reason}</p>}
   {items.length===0?<p className="muted">No appointments</p>:items.map(r=><button key={r.id} type="button" className={`cal-week-item appt-${r.status}`} style={{borderLeftColor:r.dentistColor??'#185d55'}} onClick={()=>onSelect(r.id)}><strong>{clockOf(timezone,r.startsAt)} {r.patientName}</strong><span>{r.dentistName??'Branch'} · {statusLabels[r.status]}</span></button>)}</div>;})}</div>;
}
// Preloads a patient chosen elsewhere (search or profile) by ID; the name comes from the server, never the URL.
function usePreselectedPatient(patientId:string|undefined){
 const {scope}=useClinic();const [patient,setPatient]=useState<{id:string;name:string}|null>(null);
 useEffect(()=>{if(!patientId)return;const c=new AbortController();api(`/api/v1/patients/${patientId}/profile`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted)setPatient({id:patientId,name:d.patient.name});}).catch(()=>{});return()=>c.abort();},[scope,patientId]);
 return [patient,setPatient] as const;
}
function PatientPicker({value,onChange,disabled}:{value:{id:string;name:string}|null;onChange:(p:{id:string;name:string}|null)=>void;disabled:boolean}){
 const {scope}=useClinic();const [search,setSearch]=useState('');const [options,setOptions]=useState<{id:string;name:string;phone:string;status:string}[]|null>(null);const [error,setError]=useState('');
 useEffect(()=>{if(value||search.trim().length<2)return;const c=new AbortController();const t=setTimeout(()=>{api(`/api/v1/patients?search=${encodeURIComponent(search)}`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted){setOptions(d.patients);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});},250);return()=>{clearTimeout(t);c.abort();};},[scope,search,value]);
 if(value)return <div className="picked"><span>Patient: <strong>{value.name}</strong></span><button type="button" className="secondary" disabled={disabled} onClick={()=>onChange(null)}>Change</button></div>;
 return <div><label>Find patient<input value={search} onChange={e=>{setSearch(e.target.value);setOptions(null);}} placeholder="Name, phone or patient ID" maxLength={100} disabled={disabled} autoFocus/></label>{error&&<p role="alert">{error}</p>}
  {search.trim().length>=2&&<ul className="picker-list">{options===null?<li className="muted">Searching…</li>:options.length===0?<li className="muted">No matching patients. <Link href="/patients">Register a new patient</Link></li>:options.slice(0,8).map(p=><li key={p.id}><button type="button" className="secondary" onClick={()=>onChange({id:p.id,name:p.name})}>{p.name} <span className="muted">{p.phone}{p.status!=='active'?` · ${p.status}`:''}</span></button></li>)}</ul>}</div>;
}
function Override({error,busy,submit}:{error:{message:string;code:string}|null;busy:boolean;submit:(reason:string)=>void}){
 const {can}=useClinic();const [reason,setReason]=useState('');if(!error)return null;
 return <div role="alert" className="staff-error"><p>{error.message}</p>{error.code==='SLOT_CONFLICT'&&(can('appointment.override')?<><label>Reason for booking anyway<input value={reason} onChange={e=>setReason(e.target.value)} minLength={3} maxLength={300} placeholder="e.g. Emergency, dentist agreed"/></label><button type="button" disabled={busy||reason.trim().length<3} onClick={()=>submit(reason.trim())}>Book anyway</button></>:<p>Choose another time, or ask a manager with override access.</p>)}</div>;
}
function ResourceFields({settings,procedures,defaults,onProcedure,disabled,withProcedure=true}:{settings:Settings;procedures:Procedure[];defaults:{dentistId?:string;chairId?:string;procedureId?:string};onProcedure?:(p:Procedure|null)=>void;disabled:boolean;withProcedure?:boolean}){
 const dentists=settings.dentists.filter(d=>d.active);const chairs=settings.chairs.filter(c=>c.active);
 return <>{dentists.length>0&&<label>Dentist<select name="dentistId" defaultValue={defaults.dentistId??''} required disabled={disabled}><option value="" disabled>Select dentist</option>{dentists.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
  {chairs.length>0&&<label>Chair (optional)<select name="chairId" defaultValue={defaults.chairId??''} disabled={disabled}><option value="">No chair</option>{chairs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {withProcedure&&<label>Procedure (optional)<select name="procedureId" defaultValue={defaults.procedureId??''} disabled={disabled} onChange={e=>onProcedure?.(procedures.find(p=>p.id===e.target.value)??null)}><option value="">Not specified</option>{procedures.map(p=><option key={p.id} value={p.id}>{p.name} · {p.defaultMinutes} min</option>)}</select></label>}</>;
}
const durations=[5,10,15,20,30,45,60,75,90,120,150,180,240];
function DurationField({value,onChange,procedure,disabled}:{value:number;onChange:(v:number)=>void;procedure:Procedure|null;disabled:boolean}){
 const {can}=useClinic();const locked=Boolean(procedure)&&!can('appointment.duration.override');const options=[...new Set([...durations,value])].sort((a,b)=>a-b);
 return <label>Duration<select value={value} onChange={e=>onChange(Number(e.target.value))} disabled={disabled||locked}>{options.map(v=><option key={v} value={v}>{v} minutes</option>)}</select>{procedure&&<small className="muted">{locked?`Set by ${procedure.name}.`:value!==procedure.defaultMinutes?`Differs from the ${procedure.defaultMinutes}-minute default; recorded as a duration change.`:'Procedure default.'}</small>}</label>;
}
function Panel({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <section className="cal-panel-card"><div className="cal-panel-head"><h2>{title}</h2><button type="button" className="secondary" onClick={onClose} aria-label="Close panel">Close</button></div>{children}</section>;}
const formValues=(form:HTMLFormElement)=>{const f=new FormData(form);const value=(k:string)=>String(f.get(k)??'');return {dentistId:value('dentistId')||null,chairId:value('chairId')||null,procedureId:value('procedureId')||null,reason:value('reason'),notes:value('notes'),nextAction:value('nextAction'),source:value('source')||undefined,date:value('date'),time:value('time')};};
function BookingForm({draft,patientId,settings,procedures,onClose,onSaved}:{draft:{date:string;time:string;dentistId:string};patientId?:string;settings:Settings;procedures:Procedure[];onClose:()=>void;onSaved:(id:string,message:string)=>void}){
 const {busy,error,send}=useCommand();const [patient,setPatient]=usePreselectedPatient(patientId);const [procedure,setProcedure]=useState<Procedure|null>(null);const [minutes,setMinutes]=useState(settings.hours?.slotMinutes&&settings.hours.slotMinutes>=15?settings.hours.slotMinutes:30);const formRef=useRef<HTMLFormElement>(null);
 function submit(override:string|null){const form=formRef.current;if(!form||!patient)return;const v=formValues(form);const startsAt=zonedInstant(settings.timezone,v.date,v.time);
  void send<{appointment:{id:string}}>('/api/v1/appointments','POST',{patientId:patient.id,startsAt:startsAt.toISOString(),endsAt:new Date(+startsAt+minutes*60000).toISOString(),dentistId:v.dentistId,chairId:v.chairId,procedureId:v.procedureId,reason:v.reason,notes:v.notes,nextAction:v.nextAction,source:v.source,override:override?{reason:override}:null},d=>onSaved(d.appointment.id,`Booked ${patient.name} at ${v.time} on ${v.date}.`));}
 return <Panel title="New booking" onClose={onClose}><PatientPicker value={patient} onChange={setPatient} disabled={busy}/>{patient&&<p><BalanceBadge patientId={patient.id}/></p>}
  <form ref={formRef} onSubmit={(e:FormEvent)=>{e.preventDefault();submit(null);}}>
   <div className="form-row"><label>Date<input name="date" type="date" defaultValue={draft.date} required disabled={busy}/></label><label>Start time<input name="time" type="time" step={300} defaultValue={draft.time} required disabled={busy}/></label></div>
   <ResourceFields settings={settings} procedures={procedures} defaults={{dentistId:draft.dentistId}} disabled={busy} onProcedure={p=>{setProcedure(p);if(p)setMinutes(p.defaultMinutes);}}/>
   <DurationField value={minutes} onChange={setMinutes} procedure={procedure} disabled={busy}/>
   <label>Reason for visit<input name="reason" maxLength={240} disabled={busy} placeholder="e.g. Pain lower left"/></label>
   <label>Booked via<select name="source" defaultValue="phone" disabled={busy}>{bookingSources.filter(s=>s!=='walk_in'&&s!=='online'&&s!=='follow_up').map(s=><option key={s} value={s}>{sourceLabels[s]}</option>)}</select></label>
   <details><summary>Notes and next action</summary><label>Notes<textarea name="notes" maxLength={1000} disabled={busy}/></label><label>Next action<input name="nextAction" maxLength={240} disabled={busy} placeholder="e.g. Call to confirm the day before"/></label></details>
   <Override error={error} busy={busy} submit={reason=>submit(reason)}/>
   <button disabled={busy||!patient}>{busy?'Booking…':'Book appointment'}</button></form></Panel>;
}
function WalkInForm({patientId,settings,procedures,onClose,onSaved}:{patientId?:string;settings:Settings;procedures:Procedure[];onClose:()=>void;onSaved:(id:string)=>void}){
 const {busy,error,send}=useCommand();const [patient,setPatient]=usePreselectedPatient(patientId);const [procedure,setProcedure]=useState<Procedure|null>(null);const [minutes,setMinutes]=useState(30);
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!patient)return;const v=formValues(e.currentTarget);void send<{appointment:{id:string}}>('/api/v1/appointments/walk-ins','POST',{patientId:patient.id,dentistId:v.dentistId,chairId:v.chairId,procedureId:v.procedureId,minutes,reason:v.reason,notes:v.notes},d=>onSaved(d.appointment.id));}
 return <Panel title="Walk-in patient" onClose={onClose}><p>Records the patient as arrived now. Walk-ins wait for the dentist, so busy calendars do not block them.</p><PatientPicker value={patient} onChange={setPatient} disabled={busy}/>
  <form onSubmit={submit}><ResourceFields settings={settings} procedures={procedures} defaults={{}} disabled={busy} onProcedure={p=>{setProcedure(p);if(p)setMinutes(p.defaultMinutes);}}/><DurationField value={minutes} onChange={setMinutes} procedure={procedure} disabled={busy}/>
   <label>Reason for visit<input name="reason" maxLength={240} disabled={busy}/></label><label>Notes<textarea name="notes" maxLength={1000} disabled={busy}/></label>
   {error&&<p role="alert" className="staff-error">{error.message}</p>}<button disabled={busy||!patient}>{busy?'Saving…':'Record walk-in'}</button></form></Panel>;
}
type HistoryEvent={version:number;kind:string;fromStatus:AppointmentStatus|null;toStatus:AppointmentStatus;detail:{note?:string;override?:string;previousStartsAt?:string;startsAt?:string;durationOverride?:boolean;visitId?:string};createdAt:string;actorName:string};
function AppointmentPanel({row,settings,procedures,onClose,onChanged}:{row:Appointment;settings:Settings;procedures:Procedure[];onClose:()=>void;onChanged:(message:string)=>void}){
 const {scope,can}=useClinic();const router=useRouter();const {busy,error,setError,send}=useCommand();const [pending,setPending]=useState<AppointmentStatus|null>(null);const [note,setNote]=useState('');const [mode,setMode]=useState<''|'reschedule'|'details'>('');const [history,setHistory]=useState<HistoryEvent[]|null>(null);const [openedAt]=useState(()=>Date.now());
 const tz=settings.timezone;const canWrite=can('appointment.write');const next=transitions[row.status].filter(s=>s!=='no_show'||+new Date(row.startsAt)<=openedAt);
 useEffect(()=>{const c=new AbortController();api(`/api/v1/appointments/${row.id}/history`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted)setHistory(d.events);}).catch(()=>{if(!c.signal.aborted)setHistory([]);});return()=>c.abort();},[scope,row.id,row.version]);
 function change(status:AppointmentStatus){if(transitionNeedsNote(row.status,status)&&pending!==status){setPending(status);setNote('');setError(null);return;}void send(`/api/v1/appointments/${row.id}`,'PATCH',{expectedVersion:row.version,status,note:pending===status?note:''},()=>{setPending(null);onChanged(`${row.patientName}: ${statusLabels[status]}.`);});}
 async function startVisit(){
  // A visit already started for this appointment is reopened rather than duplicated.
  if(row.status==='in_treatment'){try{const d=await api(`/api/v1/visits?patientId=${row.patientId}`,{headers:scopeHeaders(scope)});const existing=(d.visits as {id:string;appointmentId:string|null}[]).find(v=>v.appointmentId===row.id);if(existing){router.push(`/visits/${existing.id}`);return;}}catch{/* fall through to starting a visit */}}
  void send<{visit:{id:string}}>('/api/v1/visits','POST',{patientId:row.patientId,appointmentId:row.id},d=>router.push(`/visits/${d.visit.id}`));
 }
 const local=localParts(tz,new Date(row.startsAt));
 return <Panel title={row.patientName} onClose={onClose}>
  <p><strong>{statusLabels[row.status]}</strong>{row.source==='walk_in'&&' · Walk-in'} · {local.date} {clockOf(tz,row.startsAt)}–{clockOf(tz,row.endsAt)}</p>
  <dl className="appt-facts"><dt>Patient</dt><dd><Link href={`/patients/${row.patientId}/profile`}>Profile</Link> · <Link href={`/patients/${row.patientId}/timeline`}>Timeline</Link></dd>{row.dentistName&&<><dt>Dentist</dt><dd>{row.dentistName}</dd></>}{row.chairName&&<><dt>Chair</dt><dd>{row.chairName}</dd></>}{row.procedureName&&<><dt>Procedure</dt><dd>{row.procedureName}</dd></>}{row.reason&&<><dt>Reason</dt><dd>{row.reason}</dd></>}<dt>Booked via</dt><dd>{sourceLabels[row.source]}</dd>{can('billing.read')&&<><dt>Account</dt><dd><BalanceBadge patientId={row.patientId}/></dd></>}{row.notes&&<><dt>Notes</dt><dd>{row.notes}</dd></>}{row.nextAction&&<><dt>Next action</dt><dd>{row.nextAction}</dd></>}{row.overrideReason&&<><dt>Override</dt><dd>{row.overrideReason}</dd></>}</dl>
  {error&&<p role="alert" className="staff-error">{error.message}</p>}
  {canWrite&&next.length>0&&<div className="appt-actions">{next.map(s=><button key={s} type="button" className={s==='cancelled'||s==='no_show'?'secondary danger':''} disabled={busy} onClick={()=>change(s)}>{actionLabels[s]??statusLabels[s]}</button>)}</div>}
  {pending&&<div className="note-box"><label>{pending==='cancelled'?'Reason for cancelling':'What happened?'}<input value={note} onChange={e=>setNote(e.target.value)} minLength={3} maxLength={500} autoFocus/></label><button type="button" disabled={busy||note.trim().length<3} onClick={()=>change(pending)}>Confirm: {statusLabels[pending]}</button><button type="button" className="secondary" onClick={()=>setPending(null)}>Back</button></div>}
  {(visitStartStatuses as readonly string[]).includes(row.status)&&can('visit.draft.write')&&can('patient.clinical.read')&&<p><button type="button" disabled={busy} onClick={()=>void startVisit()}>{row.status==='in_treatment'?'Open clinical visit':'Start clinical visit'}</button></p>}
  {canWrite&&<div className="appt-actions">{(reschedulableStatuses as readonly string[]).includes(row.status)&&<button type="button" className="secondary" onClick={()=>setMode(mode==='reschedule'?'':'reschedule')}>Reschedule</button>}<button type="button" className="secondary" onClick={()=>setMode(mode==='details'?'':'details')}>Edit details</button></div>}
  {mode==='reschedule'&&<Reschedule row={row} settings={settings} onSaved={m=>{setMode('');onChanged(m);}}/>}
  {mode==='details'&&<Details row={row} procedures={procedures} onSaved={m=>{setMode('');onChanged(m);}}/>}
  <h3>History</h3>{!history?<p role="status">Loading history…</p>:<ol className="appt-history">{history.map(h=><li key={h.version}><strong>{h.kind==='rescheduled'?'Rescheduled':h.kind==='details'?'Details updated':h.kind==='walk_in'?'Walk-in arrived':h.kind==='booked'?'Booked':`${h.fromStatus?statusLabels[h.fromStatus]:''} → ${statusLabels[h.toStatus]}`}</strong>{h.kind==='rescheduled'&&h.detail.previousStartsAt&&<span> from {localParts(tz,new Date(h.detail.previousStartsAt)).date} {clockOf(tz,h.detail.previousStartsAt)}</span>}{h.detail.note&&<span> · {h.detail.note}</span>}{h.detail.override&&<span> · Override: {h.detail.override}</span>}{h.detail.durationOverride&&<span> · Duration changed from procedure default</span>}<small>{h.actorName} · {new Date(h.createdAt).toLocaleString('en-GB',{timeZone:tz})}</small></li>)}</ol>}
 </Panel>;
}
function Reschedule({row,settings,onSaved}:{row:Appointment;settings:Settings;onSaved:(message:string)=>void}){
 const {busy,error,send}=useCommand();const tz=settings.timezone;const formRef=useRef<HTMLFormElement>(null);const length=useMemo(()=>Math.round((+new Date(row.endsAt)-+new Date(row.startsAt))/60000),[row]);const [minutes,setMinutes]=useState(length);
 const procedure=row.procedureId?{id:row.procedureId,name:row.procedureName??'the procedure',defaultMinutes:length}:null;
 function submit(override:string|null){const form=formRef.current;if(!form)return;const v=formValues(form);const startsAt=zonedInstant(tz,v.date,v.time);void send('/api/v1/appointments/'+row.id+'/reschedule','POST',{expectedVersion:row.version,startsAt:startsAt.toISOString(),endsAt:new Date(+startsAt+minutes*60000).toISOString(),dentistId:v.dentistId,chairId:v.chairId,note:String(new FormData(form).get('note')??''),override:override?{reason:override}:null},()=>onSaved(`Moved to ${v.date} ${v.time}. Confirm the new time with the patient.`));}
 return <form ref={formRef} className="sub-form" onSubmit={e=>{e.preventDefault();submit(null);}}><h3>Reschedule</h3><div className="form-row"><label>New date<input name="date" type="date" defaultValue={localParts(tz,new Date(row.startsAt)).date} required disabled={busy}/></label><label>New time<input name="time" type="time" step={300} defaultValue={clockOf(tz,row.startsAt)} required disabled={busy}/></label></div>
  <ResourceFields settings={settings} procedures={[]} withProcedure={false} defaults={{dentistId:row.dentistId??'',chairId:row.chairId??''}} disabled={busy}/><DurationField value={minutes} onChange={setMinutes} procedure={procedure} disabled={busy}/>
  <label>Note (optional)<input name="note" maxLength={500} disabled={busy} placeholder="e.g. Patient requested evening"/></label><Override error={error} busy={busy} submit={reason=>submit(reason)}/><button disabled={busy}>{busy?'Saving…':'Move appointment'}</button></form>;
}
function Details({row,procedures,onSaved}:{row:Appointment;procedures:Procedure[];onSaved:(message:string)=>void}){
 const {busy,error,send}=useCommand();
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const v=formValues(e.currentTarget);void send(`/api/v1/appointments/${row.id}/details`,'PATCH',{expectedVersion:row.version,procedureId:v.procedureId,reason:v.reason,notes:v.notes,nextAction:v.nextAction},()=>onSaved('Appointment details saved.'));}
 const options=row.procedureId&&!procedures.some(p=>p.id===row.procedureId)?[...procedures,{id:row.procedureId,name:row.procedureName??'Current procedure',defaultMinutes:0}]:procedures;
 return <form className="sub-form" onSubmit={submit}><h3>Edit details</h3><label>Procedure<select name="procedureId" defaultValue={row.procedureId??''} disabled={busy}><option value="">Not specified</option>{options.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Reason<input name="reason" defaultValue={row.reason} maxLength={240} disabled={busy}/></label><label>Notes<textarea name="notes" defaultValue={row.notes} maxLength={1000} disabled={busy}/></label><label>Next action<input name="nextAction" defaultValue={row.nextAction} maxLength={240} disabled={busy}/></label>{error&&<p role="alert" className="staff-error">{error.message}</p>}<button disabled={busy}>{busy?'Saving…':'Save details'}</button></form>;
}
