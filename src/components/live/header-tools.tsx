'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect,useRef,useState } from 'react';
import { Plus,Search } from 'lucide-react';
import { api,scopeHeaders,useClinic } from './session';
type Result={id:string;name:string;phone:string;status?:string};
// Adds the patient to the signed-in staff member's recent list. Failure only affects that convenience list.
export function useRecordPatientView(patientId:string){
 const {scope,can}=useClinic();const allowed=can('patient.demographics.read');
 useEffect(()=>{if(!allowed||!patientId)return;void api(`/api/v1/patients/${patientId}/viewed`,{method:'POST',headers:scopeHeaders(scope),body:'{}'}).catch(()=>{});},[scope,patientId,allowed]);
}
export function PatientSearch(){
 const {scope,can}=useClinic();const path=usePathname();const [query,setQuery]=useState('');const [open,setOpen]=useState(false);const [results,setResults]=useState<Result[]|null>(null);const [recent,setRecent]=useState<Result[]|null>(null);const [error,setError]=useState('');const box=useRef<HTMLDivElement>(null);
 const term=query.trim();
 useEffect(()=>{if(!open||term.length<2)return;const c=new AbortController();const t=setTimeout(()=>{api(`/api/v1/patients?search=${encodeURIComponent(term)}`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted){setResults(d.patients);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});},250);return()=>{clearTimeout(t);c.abort();};},[scope,term,open]);
 useEffect(()=>{if(!open||term)return;const c=new AbortController();api('/api/v1/patients/recent',{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted)setRecent(d.patients);}).catch(()=>{if(!c.signal.aborted)setRecent([]);});return()=>c.abort();},[scope,term,open]);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false);};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[open]);
 const [lastPath,setLastPath]=useState(path);if(path!==lastPath){setLastPath(path);setOpen(false);setQuery('');}
 if(!can('patient.demographics.read'))return null;
 const list=term.length>=2?results:term?[]:recent;const canBook=can('appointment.write');
 return <div className="header-search" ref={box} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
  <label className="sr-only" htmlFor="global-patient-search">Search patients</label><Search size={16} aria-hidden/>
  <input id="global-patient-search" type="search" value={query} placeholder="Search patients…" maxLength={100} autoComplete="off" onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setResults(null);setOpen(true);}}/>
  {open&&<div className="header-search-results" role="listbox" aria-label={term?'Matching patients':'Recently opened patients'}>
   <p className="header-search-title">{term.length>=2?'Matching patients':term?'Type at least 2 characters':'Recently opened'}</p>{error&&<p role="alert" className="staff-error">{error}</p>}
   {list===null?<p className="muted">Loading…</p>:list.length===0?<p className="muted">{term.length>=2?'No matching patients.':term?'':'No recent patients yet.'}</p>:list.slice(0,8).map(p=><div key={p.id} className="header-search-item" role="option" aria-selected={false}>
    <Link href={`/patients/${p.id}/profile`}><strong>{p.name}</strong><span>{p.phone}{p.status&&p.status!=='active'?` · ${p.status}`:''}</span></Link>
    <span className="header-search-actions"><Link href={`/patients/${p.id}/timeline`}>Timeline</Link>{canBook&&<Link href={`/appointments?book=1&patientId=${p.id}`}>Book</Link>}</span></div>)}
  </div>}
 </div>;
}
export function QuickAdd(){
 const {can}=useClinic();const path=usePathname();const menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(menu.current)menu.current.open=false;},[path]);
 const items=[{href:'/patients?new=1',label:'New patient',allowed:can('patient.demographics.write')},{href:'/appointments?book=1',label:'Book appointment',allowed:can('appointment.write')},{href:'/appointments?walkin=1',label:'Walk-in',allowed:can('appointment.write')},{href:'/billing',label:'Record payment',allowed:can('payment.post')},{href:'/follow-ups',label:'Follow-up / recall',allowed:can('followup.write')}].filter(i=>i.allowed);
 if(!items.length)return null;
 return <details className="quick-add" ref={menu}><summary><Plus size={16} aria-hidden/>Quick add</summary><div className="quick-add-menu">{items.map(i=><Link key={i.href} href={i.href}>{i.label}</Link>)}</div></details>;
}
