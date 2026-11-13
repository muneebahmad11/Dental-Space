'use client';
import { patientRef } from '@/lib/display';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { rupees } from '@/lib/messaging/templates';
import { api, scopeHeaders, useClinic } from './session';
import { WhatsAppButtons } from './whatsapp';

type Row = { id: string; name: string; displayId: string; phone: string; balanceMinor: string; oldestUnpaidOn: string | null; daysOutstanding: number | null; lastPaidOn: string | null };
type Data = { patients: Row[]; totalPatients: number; totalMinor: string; more: boolean };
const age = (days: number | null) => days === null ? '' : days === 0 ? 'Today' : days === 1 ? '1 day' : days < 60 ? `${days} days` : `${Math.floor(days / 30)} months`;
const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

// Who still owes the clinic money, biggest or oldest first, with a one-click WhatsApp reminder.
export function UnpaidBalances() {
  const { scope, can } = useClinic();
  const [sort, setSort] = useState<'amount' | 'oldest'>('amount');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const allowed = can('billing.read') && can('patient.demographics.read');
  useEffect(() => {
    if (!allowed) return; const c = new AbortController();
    api(`/api/v1/billing/dues?${new URLSearchParams({ sort, offset: String(offset) })}`, { headers: scopeHeaders(scope), signal: c.signal })
      .then(d => { if (!c.signal.aborted) { setData(d); setError(''); } }).catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [scope, sort, offset, allowed]);
  if (!allowed) return <div className="staff-workspace live-inner"><h1>Unpaid balances</h1><p>Your account needs billing read access.</p></div>;
  const choose = (s: 'amount' | 'oldest') => { setSort(s); setOffset(0); setData(null); };
  return <div className="staff-workspace live-inner">
    <div className="page-heading"><div><h1>Unpaid balances</h1><p className="page-sub">Patients at {scope.branchName} who still owe money.</p></div></div>
    {error && <p role="alert" className="staff-error">{error}</p>}
    {data && <div className="stats-grid dues-summary"><div className="stat-card is-now"><strong>{rupees(data.totalMinor)}</strong><span>Owed to the clinic</span></div><div className="stat-card"><strong>{new Intl.NumberFormat('en-PK').format(data.totalPatients)}</strong><span>{data.totalPatients === 1 ? 'Patient with a balance' : 'Patients with a balance'}</span></div></div>}
    <section>
      <div className="dues-toolbar"><div className="segmented" role="group" aria-label="Sort by">
        <button type="button" aria-pressed={sort === 'amount'} onClick={() => choose('amount')}>Largest first</button>
        <button type="button" aria-pressed={sort === 'oldest'} onClick={() => choose('oldest')}>Oldest first</button>
      </div></div>
      {!data ? !error && <p role="status" className="loading">Loading balances…</p>
        : data.patients.length === 0 ? <p className="empty-note">Nobody owes anything at this branch. Every posted charge has been paid or credited.</p>
        : <div className="table-scroll"><table className="data-table dues-table"><thead><tr><th>Patient</th><th className="num">Owes</th><th>Unpaid since</th><th>Last payment</th><th></th></tr></thead>
          <tbody>{data.patients.map(p => <tr key={p.id}>
            <td><Link href={`/accounts/${p.id}`} className="dues-name">{p.name}</Link><small>{patientRef(p.displayId)} · {p.phone}</small></td>
            <td className="num"><strong>{rupees(p.balanceMinor)}</strong></td>
            <td>{p.oldestUnpaidOn ? <><span className={p.daysOutstanding !== null && p.daysOutstanding > 30 ? 'overdue' : ''}>{age(p.daysOutstanding)}</span><small>{dayLabel(p.oldestUnpaidOn)}</small></> : '—'}</td>
            <td>{p.lastPaidOn ? dayLabel(p.lastPaidOn) : <span className="muted">No payments</span>}</td>
            <td><div className="row-actions"><WhatsAppButtons patientId={p.id} templates={['payment_due']} compact /><Link href={`/accounts/${p.id}`} className="text-button">Open account</Link></div></td>
          </tr>)}</tbody></table></div>}
      {data && (offset > 0 || data.more) && <div className="live-pagination"><button type="button" disabled={offset === 0} onClick={() => { setOffset(o => Math.max(0, o - 50)); setData(null); }}>Previous</button><span>{offset + 1}–{offset + data.patients.length} of {data.totalPatients}</span><button type="button" disabled={!data.more} onClick={() => { setOffset(o => o + 50); setData(null); }}>Next</button></div>}
    </section>
  </div>;
}
