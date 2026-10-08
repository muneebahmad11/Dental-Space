'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { moneyMinor } from '@/lib/finance/contracts';
import { minorToInput,procedureCategories,type ProcedureSnapshot } from '@/lib/procedures/contracts';
import { api,scopeHeaders,useClinic } from './session';
type Procedure={id:string;code:string;name:string;category:string;defaultMinutes:number;priceMinor:number|null;active:boolean;version:number};
type History={version:number;snapshot:ProcedureSnapshot;createdAt:string;actorName:string};
function useCommand(){
 const {scope}=useClinic();const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const operation=useRef<{id:string;payload:string}|null>(null);
 async function send(url:string,method:string,values:Record<string,unknown>,done:()=>void,message:string){
  if(busy)return;const payload=JSON.stringify({url,method,...values});if(operation.current&&operation.current.payload!==payload)operation.current=null;operation.current??={id:crypto.randomUUID(),payload};
  setBusy(true);setError('');setNotice('');
  try{await api(url,{method,headers:scopeHeaders(scope),body:JSON.stringify({...values,operationId:operation.current.id})});operation.current=null;setNotice(message);done();}
  catch(e){if(e instanceof Error&&'status' in e&&Number(e.status)>=400&&Number(e.status)<500)operation.current=null;setError(e instanceof Error?e.message:'Procedure could not be saved.');}
  finally{setBusy(false);}
 }
 return {busy,error,notice,send};
}
const values=(form:HTMLFormElement)=>{const f=new FormData(form);return {code:String(f.get('code')??''),name:f.get('name'),category:f.get('category'),defaultMinutes:Number(f.get('defaultMinutes')),price:f.get('price')?String(f.get('price')):null};};
export function ProcedureCatalog(){
 const {scope}=useClinic();const {busy,error,notice,send}=useCommand();const [items,setItems]=useState<Procedure[]|null>(null);const [canConfigure,setCanConfigure]=useState(false);const [search,setSearch]=useState('');const [inactive,setInactive]=useState(false);const [revision,setRevision]=useState(0);const [loadError,setLoadError]=useState('');const [editing,setEditing]=useState('');const [selected,setSelected]=useState('');
 useEffect(()=>{const c=new AbortController();api(`/api/v1/procedures?${new URLSearchParams({search,includeInactive:String(inactive)})}`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted){setItems(d.items);setCanConfigure(d.canConfigure);setLoadError('');}}).catch(e=>{if(!c.signal.aborted)setLoadError(e.message);});return()=>c.abort();},[scope,search,inactive,revision]);
 const reload=()=>setRevision(n=>n+1);
 function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;void send('/api/v1/procedures','POST',values(form),()=>{form.reset();reload();},'Procedure added.');}
 function update(e:FormEvent<HTMLFormElement>,row:Procedure,active=row.active){e.preventDefault();void send(`/api/v1/procedures/${row.id}`,'PATCH',{...values(e.currentTarget),active,expectedVersion:row.version},()=>{setEditing('');reload();},'Procedure updated. Existing estimates and charges keep their original prices.');}
 function toggle(row:Procedure){void send(`/api/v1/procedures/${row.id}`,'PATCH',{code:row.code,name:row.name,category:row.category,defaultMinutes:row.defaultMinutes,price:row.priceMinor===null?null:minorToInput(row.priceMinor),active:!row.active,expectedVersion:row.version},reload,row.active?'Procedure deactivated; it can no longer be chosen for new work.':'Procedure reactivated.');}
 const fields=(row?:Procedure)=><div className="form-row"><label>Name<input name="name" required minLength={2} maxLength={120} defaultValue={row?.name} disabled={busy}/></label><label>Code (optional)<input name="code" maxLength={20} pattern="[A-Za-z0-9._\-]*" defaultValue={row?.code} disabled={busy}/></label><label>Category<select name="category" defaultValue={row?.category??'Consultation'} disabled={busy}>{procedureCategories.map(c=><option key={c}>{c}</option>)}</select></label><label>Default duration (minutes)<input name="defaultMinutes" type="number" min={5} max={480} step={5} required defaultValue={row?.defaultMinutes??30} disabled={busy}/></label><label>Default price, PKR (optional)<input name="price" inputMode="decimal" pattern="(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?" defaultValue={row?minorToInput(row.priceMinor):''} disabled={busy}/></label></div>;
 return <div className="staff-workspace live-inner"><div className="page-heading"><div><p className="eyebrow">Clinic catalog</p><h1>Procedures</h1></div></div>
  <p>Procedures, default appointment durations and default prices used when booking and planning treatment. Changing a price never changes estimates or charges already created. Nothing is deleted; old procedures are deactivated.</p>
  {(error||loadError)&&<p role="alert" className="staff-error">{error||loadError}</p>}{notice&&<p role="status">{notice}</p>}
  <section><div className="staff-toolbar"><label>Search<input value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="Name or code"/></label><label className="checkbox"><input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>Show inactive</label></div>
   {!items?<p role="status">Loading procedures…</p>:items.length===0?<p>{search?'No matching procedures.':'No procedures yet. The dentist and owner should agree the list, durations and prices (clinic decision D04).'}</p>:
   <div className="table-scroll"><table className="data-table"><thead><tr><th>Procedure</th><th>Category</th><th>Duration</th><th>Default price</th><th></th></tr></thead><tbody>{items.map(row=>editing===row.id?<tr key={row.id}><td colSpan={5}><form onSubmit={e=>update(e,row)}>{fields(row)}<button disabled={busy}>Save</button><button type="button" className="secondary" onClick={()=>setEditing('')}>Cancel</button></form></td></tr>:<tr key={row.id} className={row.active?'':'inactive'}><td><strong>{row.name}</strong>{row.code&&<span className="muted"> · {row.code}</span>}{!row.active&&<span className="muted"> · Inactive</span>}</td><td>{row.category}</td><td>{row.defaultMinutes} min</td><td>{row.priceMinor===null?'—':moneyMinor(row.priceMinor)}</td><td className="row-actions"><button className="secondary" onClick={()=>setSelected(selected===row.id?'':row.id)}>History</button>{canConfigure&&<><button className="secondary" disabled={busy} onClick={()=>setEditing(row.id)}>Edit</button><button className="secondary" disabled={busy} onClick={()=>toggle(row)}>{row.active?'Deactivate':'Reactivate'}</button></>}</td></tr>)}</tbody></table></div>}
  </section>
  {selected&&<ProcedureHistory id={selected} revision={revision}/>}
  {canConfigure&&<section><h2>Add procedure</h2><form onSubmit={create}>{fields()}<button disabled={busy}>{busy?'Saving…':'Add procedure'}</button></form></section>}
 </div>;
}
function ProcedureHistory({id,revision}:{id:string;revision:number}){
 const {scope}=useClinic();const [data,setData]=useState<{procedure:Procedure;history:History[]}|null>(null);const [error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();api(`/api/v1/procedures/${id}`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted){setData(d);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope,id,revision]);
 return <section><h2>Change history{data?` · ${data.procedure.name}`:''}</h2>{error&&<p role="alert" className="staff-error">{error}</p>}{!data?<p role="status">Loading history…</p>:<ul>{data.history.map(h=><li key={h.version}><div><strong>Version {h.version}</strong> · {h.snapshot.name} · {h.snapshot.defaultMinutes} min · {h.snapshot.priceMinor===null?'no default price':moneyMinor(h.snapshot.priceMinor)}{!h.snapshot.active&&' · inactive'}<p>{h.actorName} · {new Date(h.createdAt).toLocaleString('en-PK',{timeZone:scope.timezone})}</p></div></li>)}</ul>}</section>;
}
