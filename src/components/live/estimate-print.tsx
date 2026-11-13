'use client';
import { patientRef } from '@/lib/display';
import { BackLink } from './back-link';
import { useEffect, useState } from 'react';
import { moneyMinor } from '@/lib/finance/contracts';
import type { PlanSnapshot } from '@/lib/plans/contracts';
import { api, scopeHeaders, useClinic } from './session';
import { WhatsAppButtons } from './whatsapp';
import { LogoImage } from '@/components/brand';

type Plan = { plan: { id: string; patientId: string; status: string; version: number }; patientName: string; patientDisplayId?: string; versions: { version: number; snapshot: PlanSnapshot; createdAt: string }[] };
type Settings = { settings: { name: string; phone: string; city: string; address: string; receiptHeader: string; receiptFooter: string; ntn: string }; logo?: { dataUrl: string } | null };
const longDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const issued = (at: string, tz: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(new Date(at));

// A printable treatment estimate on the clinic's letterhead, to hand to the patient or send as a PDF.
export function EstimatePrint({ planId }: { planId: string }) {
  const { scope, can } = useClinic();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [clinic, setClinic] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const allowed = can('plan.read') && can('patient.clinical.read') && can('patient.demographics.read');
  useEffect(() => {
    if (!allowed) return; const c = new AbortController(); const h = { headers: scopeHeaders(scope), signal: c.signal };
    Promise.all([api(`/api/v1/plans/${planId}`, h), api('/api/v1/clinic/settings', h)])
      .then(([p, s]) => { if (!c.signal.aborted) { setPlan(p); setClinic(s); } })
      .catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [scope, planId, allowed]);
  if (!allowed) return <div className="staff-workspace live-inner"><h1>Treatment estimate</h1><p>Your account needs treatment-plan and clinical read access.</p></div>;
  if (error) return <div className="staff-workspace live-inner"><p role="alert" className="staff-error">{error}</p></div>;
  if (!plan || !clinic) return <div className="staff-workspace live-inner"><p role="status" className="loading">Loading estimate…</p></div>;
  const v = plan.versions[0]; const s = v.snapshot; const c = clinic.settings;
  const discounted = Boolean(s.discountMinor && s.discountMinor !== '0');
  const contact = [[c.address, c.city].filter(Boolean).join(', '), c.phone && `Phone ${c.phone}`, c.ntn && `NTN ${c.ntn}`].filter(Boolean);
  return <div className="staff-workspace live-inner">
    <div className="print-control doc-actions"><BackLink href={`/plans?planId=${plan.plan.id}`}>Treatment plan</BackLink><button type="button" onClick={() => window.print()}>Print estimate</button><WhatsAppButtons patientId={plan.plan.patientId} templates={['estimate']} target={{ planId: plan.plan.id }} /></div>
    <article className="saved-receipt print-doc">
      <header className="doc-letterhead">
        {clinic.logo?.dataUrl && <LogoImage src={clinic.logo.dataUrl} className="doc-logo" />}
        <div><h1>{c.name}</h1>{c.receiptHeader && <p className="doc-strap">{c.receiptHeader}</p>}{contact.length > 0 && <p>{contact.join(' · ')}</p>}</div>
      </header>
      <div className="doc-title">
        <h2>Treatment estimate</h2>
        <dl><dt>Estimate</dt><dd>EST-{plan.plan.id.slice(0, 8).toUpperCase()} (version {v.version})</dd><dt>Issued</dt><dd>{issued(v.createdAt, scope.timezone)}</dd>{s.validUntil && <><dt>Valid until</dt><dd>{longDate(s.validUntil)}</dd></>}</dl>
      </div>
      <p className="doc-patient"><span>Patient</span><strong>{plan.patientName}</strong>{plan.patientDisplayId && <small>{patientRef(plan.patientDisplayId)}</small>}</p>
      <h3 className="doc-subject">{s.title}</h3>
      <table className="doc-table"><thead><tr><th>Treatment</th><th>Tooth / site</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
        <tbody>{s.items.map(i => <tr key={i.id}><td>{i.description}</td><td>{i.tooth || '—'}</td><td className="num">{i.quantity}</td><td className="num">{moneyMinor(i.unitPriceMinor)}</td><td className="num">{moneyMinor(i.totalMinor)}</td></tr>)}</tbody>
        <tfoot>
          {discounted && <><tr><td colSpan={4}>Subtotal</td><td className="num">{moneyMinor(s.subtotalMinor ?? s.totalMinor)}</td></tr><tr><td colSpan={4}>Discount{s.discountReason && ` (${s.discountReason})`}</td><td className="num">−{moneyMinor(s.discountMinor!)}</td></tr></>}
          <tr className="doc-total"><td colSpan={4}>Total</td><td className="num">{moneyMinor(s.totalMinor)}</td></tr>
        </tfoot>
      </table>
      {s.note && <p className="doc-note">{s.note}</p>}
      <p className="doc-fine">This is an estimate, not a bill. You are charged only for treatment carried out. Prices may change if the treatment plan changes{s.validUntil ? `, or after ${longDate(s.validUntil)}` : ''}.</p>
      <div className="doc-signatures"><div><span /><p>Patient or representative</p></div><div><span /><p>Dentist</p></div></div>
      {c.receiptFooter && <p className="doc-footer">{c.receiptFooter}</p>}
    </article>
  </div>;
}
