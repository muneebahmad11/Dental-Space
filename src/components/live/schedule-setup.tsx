'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { emptyWeek,resourceColors,slotLengths,weekdayLabels,weekdays,type WeeklyHours } from '@/lib/scheduling/contracts';
import { api,scopeHeaders,useClinic } from './session';
type Dentist={id:string;name:string;color:string;membershipId:string|null;active:boolean;version:number};
type Chair={id:string;name:string;active:boolean;version:number};
type Settings={timezone:string;today:string;canConfigure:boolean;dentists:Dentist[];chairs:Chair[];hours:{slotMinutes:number;weeklyHours:WeeklyHours;version:number}|null;closures:{id:string;closedOn:string;reason:string;version:number}[];staff:{id:string;name:string}[]};
// Keeps one operation key per unchanged request so an ambiguous failure can be retried safely.
function useCommand(){
 const {scope}=useClinic();const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const operation=useRef<{id:string;payload:string}|null>(null);
 async function send(url:string,method:string,values:Record<string,unknown>,done:(data:Record<string,unknown>)=>void,message:string){
  if(busy)return;const payload=JSON.stringify({url,method,...values});if(operation.current&&operation.current.payload!==payload)operation.current=null;operation.current??={id:crypto.randomUUID(),payload};
  setBusy(true);setError('');setNotice('');
  try{const data=await api(url,{method,headers:scopeHeaders(scope),body:JSON.stringify({...values,operationId:operation.current.id})});operation.current=null;setNotice(message);done(data);}
  catch(e){if(e instanceof Error&&'status' in e&&Number(e.status)>=400&&Number(e.status)<500)operation.current=null;setError(e instanceof Error?e.message:'Schedule setup could not be saved.');}
  finally{setBusy(false);}
 }
 return {busy,error,notice,send};
}
export function ScheduleSetup(){
 const {scope,can}=useClinic();const [data,setData]=useState<Settings|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const allowed=can('appointment.read')||can('schedule.configure');
 useEffect(()=>{if(!allowed)return;const c=new AbortController();api('/api/v1/schedule/settings',{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted){setData(d);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope,allowed,revision]);
 if(!allowed)return <section className="staff-workspace live-inner"><h1>Schedule setup</h1><p>Your account needs appointment read or schedule configuration access.</p></section>;
 const reload=()=>setRevision(n=>n+1);
 return <div className="staff-workspace live-inner"><div className="page-heading"><div><p className="eyebrow">{scope.branchName}</p><h1>Schedule setup</h1></div></div>
  <p>Dentist calendars, chairs, opening hours and closed dates for this branch. Times use the clinic timezone{data?` (${data.timezone})`:''}. Every change is versioned and audited; nothing is deleted.</p>
  {error&&<p role="alert" className="staff-error">{error}</p>}
  {!data?<section role="status"><p>Loading schedule setup…</p></section>:<>
   {!data.canConfigure&&<p role="status">View only. Changing the setup requires schedule configuration access.</p>}
   <OpeningHours settings={data} saved={reload}/>
   <Resources kind="dentist" settings={data} saved={reload}/>
   <Resources kind="chair" settings={data} saved={reload}/>
   <Closures settings={data} saved={reload}/>
  </>}
 </div>;
}
function Feedback({error,notice}:{error:string;notice:string}){return <>{error&&<p role="alert" className="staff-error">{error}</p>}{notice&&<p role="status">{notice}</p>}</>;}
function OpeningHours({settings,saved}:{settings:Settings;saved:()=>void}){
 const {busy,error,notice,send}=useCommand();const [week,setWeek]=useState<WeeklyHours>(settings.hours?.weeklyHours??emptyWeek);const [slot,setSlot]=useState(settings.hours?.slotMinutes??15);const edit=settings.canConfigure&&!busy;
 const change=(day:typeof weekdays[number],periods:[string,string][])=>setWeek(w=>({...w,[day]:periods}));
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();void send('/api/v1/schedule/hours','PUT',{expectedVersion:settings.hours?.version??0,slotMinutes:slot,weeklyHours:week},saved,'Opening hours saved.');}
 return <section><h2>Opening hours</h2>{!settings.hours&&<p>Not configured yet. Until opening hours are saved, bookings are not limited to opening times.</p>}<Feedback error={error} notice={notice}/>
  <form onSubmit={submit}>{weekdays.map(day=><fieldset key={day} className="hours-day" disabled={!edit}><legend>{weekdayLabels[day]}</legend>
   {week[day].length===0&&<span className="muted">Closed</span>}
   {week[day].map(([opens,closes],i)=><span key={i} className="hours-period"><input aria-label={`${weekdayLabels[day]} period ${i+1} opens`} type="time" step={300} value={opens} required onChange={e=>change(day,week[day].map((p,j)=>j===i?[e.target.value,p[1]]:p))}/>–<input aria-label={`${weekdayLabels[day]} period ${i+1} closes`} type="time" step={300} value={closes} required onChange={e=>change(day,week[day].map((p,j)=>j===i?[p[0],e.target.value]:p))}/>{edit&&<button type="button" className="secondary" onClick={()=>change(day,week[day].filter((_,j)=>j!==i))}>Remove</button>}</span>)}
   {edit&&week[day].length<4&&<button type="button" className="secondary" onClick={()=>change(day,[...week[day],week[day].length?[week[day][week[day].length-1][1],'20:00']:['09:00','17:00']])}>Add period</button>}
  </fieldset>)}
  <label>Calendar slot length<select value={slot} disabled={!edit} onChange={e=>setSlot(Number(e.target.value))}>{slotLengths.map(v=><option key={v} value={v}>{v} minutes</option>)}</select></label>
  {settings.canConfigure&&<button disabled={busy}>{busy?'Saving…':'Save opening hours'}</button>}</form></section>;
}
function Resources({kind,settings,saved}:{kind:'dentist'|'chair';settings:Settings;saved:()=>void}){
 const {busy,error,notice,send}=useCommand();const rows:(Dentist|Chair)[]=kind==='dentist'?settings.dentists:settings.chairs;const label=kind==='dentist'?'Dentist':'Chair';const [editing,setEditing]=useState('');
 const staffName=(id:string|null)=>settings.staff.find(s=>s.id===id)?.name;
 function values(form:HTMLFormElement,active?:boolean){const f=new FormData(form);return kind==='dentist'?{kind,name:f.get('name'),color:f.get('color'),membershipId:f.get('membershipId')||null,...(active===undefined?{}:{active})}:{kind,name:f.get('name'),...(active===undefined?{}:{active})};}
 function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;void send('/api/v1/schedule/resources','POST',values(form),()=>{form.reset();saved();},`${label} added.`);}
 function update(e:FormEvent<HTMLFormElement>,row:Dentist|Chair){e.preventDefault();void send(`/api/v1/schedule/resources/${row.id}`,'PATCH',{...values(e.currentTarget,row.active),expectedVersion:row.version},()=>{setEditing('');saved();},`${label} updated.`);}
 function toggle(row:Dentist|Chair){const base=kind==='dentist'?{kind,name:row.name,color:(row as Dentist).color,membershipId:(row as Dentist).membershipId}:{kind,name:row.name};void send(`/api/v1/schedule/resources/${row.id}`,'PATCH',{...base,active:!row.active,expectedVersion:row.version},saved,`${label} ${row.active?'deactivated':'reactivated'}.`);}
 const fields=(row?:Dentist|Chair)=><><label>Name<input name="name" required minLength={2} maxLength={80} defaultValue={row?.name} disabled={busy}/></label>{kind==='dentist'&&<><label>Colour<select name="color" defaultValue={(row as Dentist|undefined)?.color??resourceColors[rows.length%resourceColors.length]} disabled={busy}>{resourceColors.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>Linked staff account (optional)<select name="membershipId" defaultValue={(row as Dentist|undefined)?.membershipId??''} disabled={busy}><option value="">Not linked</option>{settings.staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></>}</>;
 return <section><h2>{kind==='dentist'?'Dentist calendars':'Chairs'}</h2><p>{kind==='dentist'?'Each dentist gets a calendar column. Linking a staff account lets the system match visits to the dentist.':'Optional. Add chairs if bookings must also avoid double-booking a chair.'}</p><Feedback error={error} notice={notice}/>
  {rows.length===0?<p>No {kind==='dentist'?'dentists':'chairs'} added yet.</p>:<ul>{rows.map(row=><li key={row.id}>{editing===row.id?<form onSubmit={e=>update(e,row)}>{fields(row)}<button disabled={busy}>Save</button><button type="button" className="secondary" onClick={()=>setEditing('')}>Cancel</button></form>:<><div>{kind==='dentist'&&<span className="color-dot" style={{background:(row as Dentist).color}}/>}<strong>{row.name}</strong>{!row.active&&<span className="muted"> · Inactive</span>}{kind==='dentist'&&(row as Dentist).membershipId&&<p>Linked to {staffName((row as Dentist).membershipId)??'staff account'}</p>}</div>{settings.canConfigure&&<div><button className="secondary" disabled={busy} onClick={()=>setEditing(row.id)}>Edit</button><button className="secondary" disabled={busy} onClick={()=>toggle(row)}>{row.active?'Deactivate':'Reactivate'}</button></div>}</>}</li>)}</ul>}
  {settings.canConfigure&&<details><summary>Add {kind}</summary><form onSubmit={create}>{fields()}<button disabled={busy}>{busy?'Saving…':`Add ${kind}`}</button></form></details>}</section>;
}
function Closures({settings,saved}:{settings:Settings;saved:()=>void}){
 const {busy,error,notice,send}=useCommand();const [warning,setWarning]=useState('');
 function add(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const f=new FormData(form);void send('/api/v1/schedule/closures','POST',{closedOn:f.get('closedOn'),reason:f.get('reason')},data=>{form.reset();setWarning(Number(data.existingBookings)>0?`${data.existingBookings} existing booking(s) fall on ${f.get('closedOn')}. Review and reschedule them; they were not cancelled automatically.`:'');saved();},'Closed date added.');}
 return <section><h2>Closed dates</h2><p>Holidays and other days the branch is closed. New bookings are refused on these dates.</p><Feedback error={error} notice={notice}/>{warning&&<p role="alert" className="staff-error">{warning}</p>}
  {settings.closures.length===0?<p>No upcoming closed dates.</p>:<ul>{settings.closures.map(c=><li key={c.id}><div><strong>{c.closedOn}</strong><p>{c.reason}</p></div>{settings.canConfigure&&<button className="secondary" disabled={busy} onClick={()=>send(`/api/v1/schedule/closures/${c.id}`,'PATCH',{expectedVersion:c.version},saved,'Closed date removed; the branch is open on that date again.')}>Reopen date</button>}</li>)}</ul>}
  {settings.canConfigure&&<details><summary>Add closed date</summary><form onSubmit={add}><label>Date<input name="closedOn" type="date" min={settings.today} required disabled={busy}/></label><label>Reason<input name="reason" required minLength={3} maxLength={200} disabled={busy} placeholder="e.g. Eid holiday"/></label><button disabled={busy}>{busy?'Saving…':'Add closed date'}</button></form></details>}</section>;
}
