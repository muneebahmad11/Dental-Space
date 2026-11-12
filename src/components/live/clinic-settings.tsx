'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { closingPolicies, closingPolicyText, type ClinicSettings, type PaymentMethod } from '@/lib/clinic/contracts';
import { api, scopeHeaders, useClinic } from './session';
type Data = { settings: ClinicSettings; paymentMethods: PaymentMethod[]; canConfigure: boolean };
export function ClinicSettingsPage() {
  const { scope } = useClinic(); const [data, setData] = useState<Data | null>(null); const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { const c = new AbortController(); api('/api/v1/clinic/settings', { headers: scopeHeaders(scope), signal: c.signal }).then(d => { if (!c.signal.aborted) setData(d); }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [scope, revision]);
  async function run(task: () => Promise<void>, message: string) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await task(); setNotice(message); setRevision(n => n + 1); } catch (e) { setError(e instanceof Error ? e.message : 'Settings could not be saved.'); } finally { setBusy(false); } }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!data) return; const f = Object.fromEntries(new FormData(e.currentTarget));
    void run(async () => { await api('/api/v1/clinic/settings', { method: 'PUT', headers: scopeHeaders(scope), body: JSON.stringify({ ...f, expectedVersion: data.settings.version }) }); }, 'Clinic settings saved. New receipts use them; receipts already issued keep their original text.');
  }
  const toggle = (m: PaymentMethod) => run(async () => { await api('/api/v1/clinic/payment-methods', { method: 'PATCH', headers: scopeHeaders(scope), body: JSON.stringify({ name: m.name, active: !m.active }) }); }, `${m.name} ${m.active ? 'disabled' : 'enabled'}.`);
  if (!data) return <div className="staff-workspace live-inner"><h1>Clinic settings</h1>{error ? <p role="alert" className="staff-error">{error}</p> : <p role="status">Loading settings…</p>}</div>;
  const { settings: s, canConfigure } = data; const off = busy || !canConfigure;
  return <div className="staff-workspace live-inner"><div className="page-heading"><div><h1>Clinic settings</h1></div></div>
    <p>These details appear on receipts. {canConfigure ? 'Changes are recorded in the audit log.' : 'Only staff with clinic setup access can change them.'}</p>
    {error && <p role="alert" className="staff-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section><h2>Clinic details and receipt text</h2><form onSubmit={save} key={s.version}>
      <div className="form-row"><label>Clinic name<input name="name" required minLength={2} maxLength={120} defaultValue={s.name} disabled={off} /></label><label>Phone<input name="phone" maxLength={30} pattern="[0-9+() \-]*" inputMode="tel" defaultValue={s.phone} disabled={off} /></label><label>City<input name="city" maxLength={80} defaultValue={s.city} disabled={off} /></label><label>NTN (optional)<input name="ntn" maxLength={30} pattern="[0-9A-Za-z\-]*" defaultValue={s.ntn} disabled={off} /></label></div>
      <label>Address<input name="address" maxLength={300} defaultValue={s.address} disabled={off} /></label>
      <label>Receipt header line (optional)<input name="receiptHeader" maxLength={200} defaultValue={s.receiptHeader} disabled={off} placeholder="e.g. Dr. Ayesha Khan, BDS, RDS" /></label>
      <label>Receipt footer (optional)<input name="receiptFooter" maxLength={300} defaultValue={s.receiptFooter} disabled={off} placeholder="e.g. Thank you. Fees once paid are refundable per clinic policy." /></label>
      <label>Daily closing approval<select name="closingApprovalPolicy" defaultValue={s.closingApprovalPolicy} disabled={off}>{closingPolicies.map(p => <option key={p} value={p}>{closingPolicyText[p]}</option>)}</select></label>
      {canConfigure && <button disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>}
    </form></section>
    <section><h2>Payment methods</h2><p>Enabled methods can be chosen for new payments and expenses. Only cash methods count in the daily cash closing. Disabling a method never changes past records.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Method</th><th>Counts as cash</th><th>Status</th><th></th></tr></thead><tbody>{data.paymentMethods.map(m => <tr key={m.name} className={m.active ? '' : 'inactive'}><td><strong>{m.name}</strong></td><td>{m.isCash ? 'Yes' : 'No'}</td><td>{m.active ? 'Enabled' : 'Disabled'}</td><td className="row-actions">{canConfigure && <button className="secondary" disabled={busy} onClick={() => toggle(m)}>{m.active ? 'Disable' : 'Enable'}</button>}</td></tr>)}</tbody></table></div>
    </section></div>;
}
