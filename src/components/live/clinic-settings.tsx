'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { closingPolicies, closingPolicyText, type ClinicSettings, type PaymentMethod } from '@/lib/clinic/contracts';
import { placeholderHelp, type ClinicTemplate } from '@/lib/messaging/templates';
import { LogoImage } from '@/components/brand';
import { api, scopeHeaders, useClinic } from './session';
type Data = { settings: ClinicSettings; paymentMethods: PaymentMethod[]; canConfigure: boolean; messageTemplates: ClinicTemplate[]; logo: { dataUrl: string } | null };
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
  if (!data) return <div className="staff-workspace live-inner"><h1>Clinic settings</h1>{error ? <p role="alert" className="staff-error">{error}</p> : <p role="status" className="loading">Loading settings…</p>}</div>;
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
    <LogoSetting logo={data.logo} canConfigure={canConfigure} busy={busy} save={body => run(async () => { await api('/api/v1/clinic/logo', { method: 'PUT', headers: scopeHeaders(scope), body: JSON.stringify({ expectedVersion: s.version, ...body }) }); }, 'remove' in body ? 'Logo removed. Receipts already issued keep their logo.' : 'Logo saved. It appears on new receipts and printed estimates.')} onError={setError} />
    <MessageWording templates={data.messageTemplates} version={s.version} canConfigure={canConfigure} busy={busy} save={templates => run(async () => { await api('/api/v1/clinic/message-templates', { method: 'PUT', headers: scopeHeaders(scope), body: JSON.stringify({ expectedVersion: s.version, templates }) }); }, 'WhatsApp message wording saved.')} />
    <section><h2>Payment methods</h2><p>Enabled methods can be chosen for new payments and expenses. Only cash methods count in the daily cash closing. Disabling a method never changes past records.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Method</th><th>Counts as cash</th><th>Status</th><th></th></tr></thead><tbody>{data.paymentMethods.map(m => <tr key={m.name} className={m.active ? '' : 'inactive'}><td><strong>{m.name}</strong></td><td>{m.isCash ? 'Yes' : 'No'}</td><td>{m.active ? 'Enabled' : 'Disabled'}</td><td className="row-actions">{canConfigure && <button className="secondary" disabled={busy} onClick={() => toggle(m)}>{m.active ? 'Disable' : 'Enable'}</button>}</td></tr>)}</tbody></table></div>
    </section></div>;
}

// Wording for the WhatsApp messages staff open from appointments, receipts, estimates and balances.
function MessageWording({ templates, version, canConfigure, busy, save }: { templates: ClinicTemplate[]; version: number; canConfigure: boolean; busy: boolean; save: (t: Record<string, string>) => void }) {
  const off = busy || !canConfigure;
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); save(Object.fromEntries(templates.map(t => [t.key, String(f.get(t.key) ?? '')]))); }
  function reset(e: React.MouseEvent<HTMLButtonElement>, t: ClinicTemplate) { const field = e.currentTarget.form?.elements.namedItem(t.key); if (field instanceof HTMLTextAreaElement) field.value = t.defaultText; }
  return <section><h2>WhatsApp messages</h2>
    <p>Staff open these in WhatsApp with the patient’s details filled in, then send them from the clinic’s own WhatsApp. Words in {'{braces}'} are replaced automatically.</p>
    <form onSubmit={submit} key={version} className="template-list">
      {templates.map(t => <div key={t.key} className="template-item">
        <div className="template-head"><label htmlFor={`tpl-${t.key}`}>{t.label}{t.custom && <span className="tag">Edited</span>}</label>{canConfigure && <button type="button" className="text-button" disabled={off} onClick={e => reset(e, t)}>Use standard wording</button>}</div>
        <textarea id={`tpl-${t.key}`} name={t.key} defaultValue={t.text} maxLength={700} rows={3} disabled={off} />
        <p className="template-fields">{t.placeholders.map(p => <code key={p} title={placeholderHelp[p]}>{`{${p}}`}</code>)}</p>
      </div>)}
      {canConfigure && <button disabled={busy}>{busy ? 'Saving…' : 'Save message wording'}</button>}
    </form></section>;
}

// Shrinks the chosen image in the browser (max 600 × 240) so uploads stay small. WebP where supported, else PNG;
// JPEG on white as a last resort for very detailed images.
async function resizeLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WebP image.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 600 / bitmap.width, 240 / bitmap.height);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser cannot prepare the image.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let url = canvas.toDataURL('image/webp', 0.92); if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
  if (url.length > 270000) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); url = canvas.toDataURL('image/jpeg', 0.85); }
  if (url.length > 270000) throw new Error('This image is too detailed. Use a simpler logo file.');
  return url;
}

function LogoSetting({ logo, canConfigure, busy, save, onError }: { logo: { dataUrl: string } | null; canConfigure: boolean; busy: boolean; save: (b: { dataUrl: string } | { remove: true }) => void; onError: (m: string) => void }) {
  const [preparing, setPreparing] = useState(false);
  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setPreparing(true); try { save({ dataUrl: await resizeLogo(file) }); } catch (err) { onError(err instanceof Error ? err.message : 'The image could not be read.'); } finally { setPreparing(false); }
  }
  return <section><h2>Logo</h2><p>Printed at the top of receipts and treatment estimates. Receipts already issued keep the logo they were printed with.</p>
    <div className="logo-setting">
      <div className="logo-preview">{logo ? <LogoImage src={logo.dataUrl} alt="Current clinic logo" /> : <span>No logo yet</span>}</div>
      {canConfigure && <div className="logo-actions">
        <label className="file-button"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void choose(e)} disabled={busy || preparing} />{preparing ? 'Preparing…' : logo ? 'Replace logo' : 'Upload logo'}</label>
        {logo && <button type="button" className="secondary" disabled={busy} onClick={() => save({ remove: true })}>Remove logo</button>}
        <small className="muted">PNG, JPG or WebP. A wide logo on a plain or transparent background prints best.</small>
      </div>}
    </div></section>;
}
