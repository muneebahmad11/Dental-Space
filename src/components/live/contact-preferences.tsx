'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { channelLabels,contactChannels,contactPurposes,preferenceSources,purposeLabels,sourceLabels,type ContactPreferenceBody } from '@/lib/contact-preferences/contracts';
import { api,scopeHeaders,useClinic } from './session';
type Data={current:{body:ContactPreferenceBody;version:number;updatedAt:string}|null;history:{version:number;body:ContactPreferenceBody;reason:string;createdAt:string;actorName:string}[];canWrite:boolean};
const blank:ContactPreferenceBody={doNotContact:false,preferredChannel:'none',channels:{phone:true,sms:false,whatsapp:false,email:false},purposes:{appointment:true,recall:true,billing:true,marketing:false},note:'',source:'in_person'};
function summary(b:ContactPreferenceBody){
 if(b.doNotContact)return 'Do not contact';
 const channels=contactChannels.filter(c=>b.channels[c]).map(c=>channelLabels[c]);const purposes=contactPurposes.filter(p=>b.purposes[p]).map(p=>purposeLabels[p].split(' ')[0].toLowerCase());
 return `${channels.length?channels.join(', '):'No channels'} · for ${purposes.length?purposes.join(', '):'nothing'}${b.preferredChannel!=='none'?` · prefers ${channelLabels[b.preferredChannel]}`:''}`;
}
export function ContactPreferences({patientId}:{patientId:string}){
 const {scope}=useClinic();const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [editing,setEditing]=useState(false);const [notice,setNotice]=useState('');
 useEffect(()=>{const c=new AbortController();api(`/api/v1/patients/${patientId}/contact-preferences`,{headers:scopeHeaders(scope),signal:c.signal}).then(d=>{if(!c.signal.aborted){setData(d);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[scope,patientId,revision]);
 return <section><h2>Contact preferences</h2><p>How this patient agreed to be contacted, by channel and purpose. WhatsApp sending also checks these. Staff calls are still logged as normal.</p>{error&&<p role="alert" className="staff-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!data?!error&&<p role="status">Loading contact preferences…</p>:<>
   <p><strong>{data.current?summary(data.current.body):'Not recorded yet'}</strong>{data.current?.body.note&&<> · {data.current.body.note}</>}</p>
   {!data.current&&<p className="muted">Not recorded does not mean the patient agreed. Ask and record their preferences.</p>}
   {data.canWrite&&!editing&&<button className="secondary" onClick={()=>{setEditing(true);setNotice('');}}>{data.current?'Change preferences':'Record preferences'}</button>}
   {editing&&<PreferenceForm patientId={patientId} data={data} onCancel={()=>setEditing(false)} onSaved={()=>{setEditing(false);setNotice('Contact preferences saved.');setData(null);setRevision(n=>n+1);}}/>}
   {data.history.length>0&&<details><summary>History ({data.history.length})</summary><ul>{data.history.map(h=><li key={h.version}><div><strong>Version {h.version}</strong> · {summary(h.body)}<p>{h.reason} · {sourceLabels[h.body.source]} · {h.actorName} · {new Date(h.createdAt).toLocaleString('en-GB',{timeZone:scope.timezone})}</p></div></li>)}</ul></details>}
  </>}</section>;
}
function PreferenceForm({patientId,data,onCancel,onSaved}:{patientId:string;data:Data;onCancel:()=>void;onSaved:()=>void}){
 const {scope}=useClinic();const [body,setBody]=useState<ContactPreferenceBody>(data.current?.body??blank);const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const operation=useRef<{id:string;payload:string}|null>(null);
 const set=<K extends keyof ContactPreferenceBody>(key:K,value:ContactPreferenceBody[K])=>setBody(b=>({...b,[key]:value}));
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;const values={expectedVersion:data.current?.version??0,body,reason};const payload=JSON.stringify(values);if(operation.current?.payload!==payload)operation.current={id:crypto.randomUUID(),payload};setBusy(true);setError('');
  try{await api(`/api/v1/patients/${patientId}/contact-preferences`,{method:'PUT',headers:scopeHeaders(scope),body:JSON.stringify({...values,operationId:operation.current.id})});operation.current=null;onSaved();}
  catch(err){if(err instanceof Error&&'status' in err&&Number(err.status)<500)operation.current=null;setError(err instanceof Error?err.message:'Preferences could not be saved.');}finally{setBusy(false);}}
 return <form onSubmit={submit} className="sub-form">
  <label className="checkbox"><input type="checkbox" checked={body.doNotContact} onChange={e=>set('doNotContact',e.target.checked)} disabled={busy}/>Do not contact this patient at all</label>
  <fieldset disabled={busy||body.doNotContact} className="check-group"><legend>Allowed channels</legend>{contactChannels.map(c=><label key={c} className="checkbox"><input type="checkbox" checked={body.channels[c]} onChange={e=>setBody(b=>({...b,channels:{...b.channels,[c]:e.target.checked},preferredChannel:!e.target.checked&&b.preferredChannel===c?'none':b.preferredChannel}))}/>{channelLabels[c]}</label>)}</fieldset>
  <fieldset disabled={busy||body.doNotContact} className="check-group"><legend>Allowed purposes</legend>{contactPurposes.map(p=><label key={p} className="checkbox"><input type="checkbox" checked={body.purposes[p]} onChange={e=>setBody(b=>({...b,purposes:{...b.purposes,[p]:e.target.checked}}))}/>{purposeLabels[p]}</label>)}</fieldset>
  <div className="form-row"><label>Preferred channel<select value={body.preferredChannel} onChange={e=>set('preferredChannel',e.target.value as ContactPreferenceBody['preferredChannel'])} disabled={busy||body.doNotContact}><option value="none">No preference</option>{contactChannels.filter(c=>body.channels[c]).map(c=><option key={c} value={c}>{channelLabels[c]}</option>)}</select></label>
   <label>How the patient told us<select value={body.source} onChange={e=>set('source',e.target.value as ContactPreferenceBody['source'])} disabled={busy}>{preferenceSources.map(s=><option key={s} value={s}>{sourceLabels[s]}</option>)}</select></label></div>
  <label>Note (optional)<input value={body.note} onChange={e=>set('note',e.target.value)} maxLength={500} disabled={busy} placeholder="e.g. Call after 5 pm; son manages appointments"/></label>
  <label>Reason for this change<input value={reason} onChange={e=>setReason(e.target.value)} required minLength={3} maxLength={300} disabled={busy} placeholder="e.g. Patient asked at reception"/></label>
  {error&&<p role="alert" className="staff-error">{error}</p>}<button disabled={busy||reason.trim().length<3}>{busy?'Saving…':'Save preferences'}</button><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button></form>;
}
