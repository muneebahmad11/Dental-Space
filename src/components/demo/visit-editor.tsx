'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ClipboardList, LockKeyhole, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emptyVisit, procedures, type TreatmentItem } from '@/lib/demo/data';
import { useDemo } from './workspace';

export function VisitEditor({ visitId }: { visitId: string }) {
  const { patients, appointments, visits, updateVisit, finishVisit } = useDemo();
  const [error, setError] = useState('');
  const appointment = appointments.find(a => a.id === visitId);
  const patient = patients.find(p => p.id === appointment?.patientId);
  const draft = visits[visitId] ?? emptyVisit;
  const locked = draft.completed || appointment?.status === 'Completed';
  if (!appointment || !patient) return <section className="panel empty-state"><ClipboardList size={30} /><h1>Visit unavailable</h1><p>This demo visit may have been cleared by a refresh. Open an appointment from the schedule.</p><Button asChild><Link href="/appointments">Back to appointments</Link></Button></section>;
  if (!['Arrived', 'Completed'].includes(appointment.status)) return <section className="panel empty-state"><h1>Patient has not arrived</h1><p>Check in a scheduled appointment before opening its visit.</p><Button asChild><Link href="/appointments">Back to appointments</Link></Button></section>;

  function addTreatment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const item: TreatmentItem = { id: crypto.randomUUID(), procedure: String(data.get('procedure')), tooth: String(data.get('tooth')), status: 'Proposed' };
    updateVisit(visitId, { items: [...draft.items, item] }); form.reset();
  }
  return <>
    <Link href="/appointments" className="text-button back-link"><ArrowLeft size={15} />Back to appointments</Link>
    <div className="page-heading"><div><p className="eyebrow">PATIENT VISIT · {appointment.date} · {appointment.time}</p><h1>{patient.name}</h1><p className="visit-subtitle">{patient.id} <span>·</span> {appointment.procedure} <span>·</span> {appointment.dentist}</p></div><span className={`visit-state ${locked ? 'is-complete' : ''}`}>{locked ? <LockKeyhole size={14} /> : <ClipboardList size={14} />}{locked ? 'Completed demo visit' : 'Draft · this session only'}</span></div>
    <div className={`clinical-alert ${patient.alert ? '' : 'no-alert'}`}><ShieldAlert size={22} /><div><strong>{patient.alert ? `Medical alert: ${patient.alert}` : 'No medical alerts recorded'}</strong><p>Review the patient’s history before recording care. This is a fictional patient.</p></div></div>
    <div className="billing-bridge"><div><strong>Patient account</strong><p>Complete the visit to charge accepted or completed items. Proposed items remain unbilled.</p></div><Button asChild variant="outline"><Link href={`/accounts/${patient.id}`}>Open account</Link></Button></div><div className="visit-grid">
      <section className="panel visit-notes"><div className="panel-heading"><div><h2>Clinical note</h2><p>{locked ? 'Read-only demo record' : 'Draft changes stay in memory while navigating this demo.'}</p></div><ClipboardList size={20} /></div>
        {locked && !visits[visitId] ? <div className="empty-state"><h3>No note in this fixture</h3><p>This appointment was seeded as completed. Open an arrived appointment to try the editor.</p></div> : <div className="demo-form note-fields"><label>Presenting concern<textarea rows={3} maxLength={2000} placeholder="Record the fictional patient's reason for visiting…" value={draft.complaint} disabled={locked} onChange={e => updateVisit(visitId, { complaint: e.target.value })} /></label><label>Findings & assessment<textarea rows={5} maxLength={4000} placeholder="Enter demo examination findings and assessment…" value={draft.findings} disabled={locked} onChange={e => updateVisit(visitId, { findings: e.target.value })} /></label><label>Care plan & follow-up<textarea rows={3} maxLength={2000} placeholder="Record the discussed plan and follow-up…" value={draft.plan} disabled={locked} onChange={e => updateVisit(visitId, { plan: e.target.value })} /></label><label className="check-label"><input type="checkbox" checked={draft.alertsReviewed} disabled={locked} onChange={e => updateVisit(visitId, { alertsReviewed: e.target.checked })} />I reviewed this demo patient’s medical alerts.</label>{error && <p role="alert" className="form-error">{error}</p>}{!locked && <div className="visit-save"><p>Completion locks this demo note and updates the appointment.</p><Button onClick={() => { if (!finishVisit(visitId)) setError('Add a presenting concern and findings, then confirm that you reviewed the alerts.'); else setError(''); }}><Check size={16} />Complete demo visit</Button></div>}</div>}
      </section>
      <aside className="panel treatment-panel"><div className="panel-heading"><div><h2>Treatment items</h2><p>{draft.items.length} items · Review charges in account</p></div></div><div className="treatment-content">{!draft.items.length && <div className="treatment-empty"><ClipboardList size={25} /><p>No treatment items yet.</p><small>Add proposed work to explore the planning workflow.</small></div>}{draft.items.map(item => <div className="treatment-item" key={item.id}><div className="treatment-item-heading"><strong>{item.procedure}</strong>{!locked && <button className="cancel-button" aria-label={`Remove ${item.procedure} for ${item.tooth || 'whole mouth'}`} onClick={() => updateVisit(visitId, { items: draft.items.filter(i => i.id !== item.id) })}><Trash2 size={14} /></button>}</div><p>{item.tooth ? `Tooth ${item.tooth} · FDI demo notation` : 'Whole mouth / not tooth-specific'}</p><label><span className="sr-only">Status for {item.procedure} {item.tooth}</span><select disabled={locked} value={item.status} onChange={e => updateVisit(visitId, { items: draft.items.map(i => i.id === item.id ? { ...i, status: e.target.value as TreatmentItem['status'] } : i) })}>{['Proposed', 'Accepted', 'Completed'].map(s => <option key={s}>{s}</option>)}</select></label></div>)}{!locked && <form onSubmit={addTreatment} className="demo-form treatment-form"><label>Procedure<select name="procedure">{procedures.map(p => <option key={p}>{p}</option>)}</select></label><label>Tooth <span>(optional)</span><select name="tooth"><option value="">Whole mouth / not specified</option>{[1, 2, 3, 4].flatMap(q => Array.from({ length: 8 }, (_, i) => `${q}${i + 1}`)).map(t => <option key={t}>{t}</option>)}</select></label><Button variant="outline" type="submit"><Plus size={15} />Add treatment item</Button></form>}</div></aside>
    </div><p className="page-footnote">Demo only: no clinical signature, durable record or audit history. Billing uses fictional prices only. Tooth numbering and clinical requirements are not yet clinic-approved.</p>
  </>;
}
