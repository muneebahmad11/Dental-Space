'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
type Scope={clinicId:string;branchId:string};
type Patient={id:string;name:string};
type Booking={id:string;patientId:string;patientName:string;startsAt:string;endsAt:string;status:string;version:number};
async function request(url:string,init:RequestInit) { const r=await fetch(url,{cache:'no-store',...init}); const data=await r.json(); if(!r.ok) throw new Error(data.error?.message||'Request failed.'); return data; }
function today() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function StaffAppointments({scope,canWrite=true}:{scope:Scope;canWrite?:boolean}) {
  const [date,setDate]=useState(today);
  const [rows,setRows]=useState<Booking[]>([]);
  const [patients,setPatients]=useState<Patient[]>([]);
  const [search,setSearch]=useState('');
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const retry=useRef<{payload:string;key:string}|null>(null);
  const headers={'x-clinic-id':scope.clinicId,'x-branch-id':scope.branchId,'Content-Type':'application/json'};
  useEffect(()=>{
    const controller=new AbortController();
    const startsAt=new Date(`${date}T00:00:00`); const endsAt=new Date(startsAt); endsAt.setDate(endsAt.getDate()+1);
    if(!Number.isFinite(+startsAt)) return;
    request(`/api/v1/appointments?${new URLSearchParams({startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString()})}`,{headers:{'x-clinic-id':scope.clinicId,'x-branch-id':scope.branchId},signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted){setRows(data.appointments);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
    return ()=>controller.abort();
  },[scope.clinicId,scope.branchId,date,revision]);
  useEffect(()=>{
    const controller=new AbortController();
    request(`/api/v1/patients?search=${encodeURIComponent(search)}`,{headers:{'x-clinic-id':scope.clinicId,'x-branch-id':scope.branchId},signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setPatients(data.patients);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[scope.clinicId,scope.branchId,search]);
  function refresh(){setError('');setLoading(true);setRows([]);setRevision(v=>v+1);}
  async function book(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(busy)return;const form=e.currentTarget;const data=new FormData(form);setBusy(true);setError('');setNotice('');
    try {
      const start=new Date(`${date}T${data.get('time')}`);const end=new Date(+start+Number(data.get('minutes'))*60000);
      const input={patientId:data.get('patientId'),startsAt:start.toISOString(),endsAt:end.toISOString()};const payload=JSON.stringify(input);
      if(!retry.current||retry.current.payload!==payload)retry.current={payload,key:crypto.randomUUID()};
      await request('/api/v1/appointments',{method:'POST',headers,body:JSON.stringify({...input,operationId:retry.current.key})});
      retry.current=null;setNotice('Appointment saved.');form.reset();refresh();
    }catch(e){setError(e instanceof Error?e.message:'Booking failed.');}finally{setBusy(false);}
  }
  async function change(row:Booking,status:string){if(busy)return;setBusy(true);setError('');setNotice('');try{await request(`/api/v1/appointments/${row.id}`,{method:'PATCH',headers,body:JSON.stringify({expectedVersion:row.version,status,operationId:crypto.randomUUID(),note:status==='cancelled'?'Cancelled at reception':''})});setNotice(`Appointment marked ${status}.`);refresh();}catch(e){setError(e instanceof Error?e.message:'Update failed.');}finally{setBusy(false);}}
  return <section className="staff-calendar"><h2>Appointments</h2><p>One calendar per branch. Times use your device timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. </p>
    <div className="staff-toolbar"><label>Date<input type="date" value={date} disabled={busy} onChange={e=>{if(e.target.value){setDate(e.target.value);setRows([]);setLoading(true);setError('');setNotice('');}}} required /></label><button disabled={busy} onClick={refresh}>Refresh calendar</button></div>
    {error&&<p role="alert" className="staff-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="staff-grid"><div><h3>Day schedule</h3>{loading?<p>Loading appointments…</p>:rows.length===0?<p>No appointments to display.</p>:<ul>{rows.map(row=><li key={row.id}><div><strong>{row.patientName}</strong><p>{new Date(row.startsAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}–{new Date(row.endsAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · {row.status}</p></div>{row.status==='booked'&&canWrite&&<div><button disabled={busy} onClick={()=>change(row,'arrived')}>Mark arrived</button><button disabled={busy} onClick={()=>change(row,'cancelled')}>Cancel booking</button></div>}</li>)}</ul>}</div>
    <div>{canWrite?<><h3>Book appointment</h3><label>Find patient<input value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setPatients([]);}} placeholder="Search patient name or phone" /></label><form onSubmit={book}><label>Patient<select name="patientId" required disabled={busy} defaultValue="" key={search}><option value="" disabled>Select patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Start time<input name="time" type="time" required disabled={busy}/></label><label>Duration<select name="minutes" defaultValue="30" disabled={busy}>{[15,30,45,60,90,120].map(v=><option key={v} value={v}>{v} minutes</option>)}</select></label><button disabled={busy||patients.length===0}>{busy?'Saving…':'Book appointment'}</button></form></>:<><h3>Calendar viewing access</h3><p>Booking and status changes require appointment write permission.</p></>}</div></div>
  </section>;
}
