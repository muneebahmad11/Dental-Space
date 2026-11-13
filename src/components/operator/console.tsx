'use client';
import { clinicDateTime } from '@/lib/time';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { deliveryText, type InviteDelivery } from '@/lib/operator/contracts';
import { api } from '@/components/live/session';
import { useIdleSignOut } from '@/components/live/idle';
import { ThemeToggle } from '@/components/theme';

type Clinic = { id: string; name: string; city: string; phone: string; timezone: string; status: 'active' | 'suspended'; planNote: string; paidUntil: string | null; createdAt: string; branchName: string | null; staffCount: number; ownerEmail: string | null; ownerName: string | null; inviteStatus: 'pending' | 'accepted' | null; inviteDelivery: InviteDelivery | null };
type Event = { id: string; action: string; occurredAt: string; operatorName: string };
const json = { 'Content-Type': 'application/json' };
const actions: Record<string, string> = { 'operator.clinic.created': 'Clinic created', 'operator.clinic.suspended': 'Suspended', 'operator.clinic.reactivated': 'Reactivated', 'operator.clinic.billing_updated': 'Plan note or paid-until changed', 'operator.owner.invited': 'Owner invited', 'operator.owner.invite_delivery': 'Invite email attempted' };
const when = (value: string) => clinicDateTime(value,'Asia/Karachi');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
function ownerLine(c: Clinic) {
  if (!c.ownerEmail) return 'No owner invited';
  if (c.inviteStatus === 'accepted') return `${c.ownerName} · ${c.ownerEmail} · signed in`;
  return `${c.ownerName} · ${c.ownerEmail} · ${deliveryText[c.inviteDelivery ?? 'not_sent']}`;
}
export function OperatorConsole() {
  const [state, setState] = useState<'loading' | 'signed-out' | 'denied' | 'ready'>('loading');
  const [name, setName] = useState(''); const [clinics, setClinics] = useState<Clinic[]>([]); const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const operation = useRef<{ id: string; payload: string } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    api('/api/v1/operator/clinics').then(data => { if (live) { setClinics(data.clinics); setName(data.operator.displayName); setState('ready'); } })
      .catch(e => { if (!live) return; if (e.status === 401) setState('signed-out'); else if (e.status === 403) setState('denied'); else { setError(e.message || 'Unable to load clinics.'); setState('ready'); } });
    return () => { live = false; };
  }, [revision]);
  async function run(task: () => Promise<string>) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { setNotice(await task()); setRevision(n => n + 1); } catch (e) { setError(e instanceof Error ? e.message : 'The request could not be completed.'); } finally { setBusy(false); }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    await run(async () => { await api('/api/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) }); return ''; });
  }
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const values = { name: f.get('name'), city: f.get('city'), phone: f.get('phone'), timezone: f.get('timezone'), branchName: f.get('branchName'), planNote: f.get('planNote'), paidUntil: f.get('paidUntil') || null, owner: { email: f.get('ownerEmail'), displayName: f.get('ownerName'), alsoDentist: f.get('alsoDentist') === 'on' } };
    // A retry of the same form reuses its key, so a slow connection never creates the clinic twice.
    const payload = JSON.stringify(values); if (operation.current?.payload !== payload) operation.current = { id: crypto.randomUUID(), payload };
    void run(async () => {
      const { clinic } = await api('/api/v1/operator/clinics', { method: 'POST', headers: json, body: JSON.stringify({ ...values, operationId: operation.current!.id }) });
      operation.current = null; form.reset();
      return `Clinic created. ${clinic.delivery ? deliveryText[clinic.delivery as InviteDelivery] : 'It already existed from an earlier attempt'}.`;
    });
  }
  const update = (c: Clinic, change: Partial<Pick<Clinic, 'status' | 'planNote' | 'paidUntil'>>, message: string) => run(async () => {
    await api(`/api/v1/operator/clinics/${c.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ status: c.status, planNote: c.planNote, paidUntil: c.paidUntil, ...change }) }); return message;
  });
  function suspend(c: Clinic) { if (window.confirm(`Suspend ${c.name}? Its staff will be blocked until you reactivate it. No data is deleted.`)) void update(c, { status: 'suspended' }, `${c.name} suspended. Staff are blocked from their next request.`); }
  function billing(e: FormEvent<HTMLFormElement>, c: Clinic) { e.preventDefault(); const f = new FormData(e.currentTarget); void update(c, { planNote: String(f.get('planNote') ?? ''), paidUntil: String(f.get('paidUntil') || '') || null }, 'Subscription details saved.'); }
  function invite(e: FormEvent<HTMLFormElement>, c: Clinic) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    void run(async () => { const { invite } = await api(`/api/v1/operator/clinics/${c.id}/owner-invite`, { method: 'POST', headers: json, body: JSON.stringify({ email: f.get('ownerEmail'), displayName: f.get('ownerName'), alsoDentist: f.get('alsoDentist') === 'on' }) }); return `Owner invite saved. ${deliveryText[invite.delivery as InviteDelivery]}.`; });
  }
  const logout = () => run(async () => { await api('/api/auth/logout', { method: 'POST' }); setClinics([]); return ''; });
  useIdleSignOut(state === 'ready', () => { void logout(); });
  const owner = (c?: Clinic) => <><label>Owner name<input name="ownerName" required minLength={2} maxLength={120} defaultValue={c?.ownerName ?? ''} disabled={busy} /></label><label>Owner email<input name="ownerEmail" type="email" required maxLength={254} defaultValue={c?.ownerEmail ?? ''} disabled={busy} /></label><label className="checkbox"><input name="alsoDentist" type="checkbox" disabled={busy} />Owner also treats patients (adds the dentist role)</label></>;

  if (state === 'loading') return <main className="staff-workspace"><section role="status"><h1>Opening the operator console…</h1></section></main>;
  if (state === 'signed-out') return <main className="staff-workspace live-login"><section><h1>Operator sign-in</h1><p>For the product operator only. Clinic staff sign in at the <Link href="/">clinic workspace</Link>.</p>{error && <p role="alert" className="staff-error">{error}</p>}<form onSubmit={login}><label>Email<input name="email" type="email" autoComplete="username" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label><button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
  if (state === 'denied') return <main className="staff-workspace live-login"><section><h1>Operator access required</h1><p>This account is not a platform operator.</p><p><Link href="/">Go to the clinic workspace</Link></p><button disabled={busy} onClick={logout}>Sign out</button></section></main>;
  const overdue = (c: Clinic) => c.status === 'active' && !!c.paidUntil && c.paidUntil < today();
  return <main className="staff-workspace operator-console">
    <header><div><h1>Clinics</h1></div><div><span className="muted">{name}</span> <ThemeToggle/> <button className="secondary" disabled={busy} onClick={logout}>Sign out</button></div></header>
    <p>Create clinics after they pay, invite the owner, and suspend or reactivate a subscription. This console never shows patient, clinical or finance records.</p>
    {error && <p role="alert" className="staff-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section><h2>{clinics.length} clinic{clinics.length === 1 ? '' : 's'}</h2>
      {clinics.length === 0 ? <p>No clinics yet. Create the first one below.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Clinic</th><th>Status</th><th>Paid until</th><th>Owner</th><th>Staff</th><th></th></tr></thead><tbody>{clinics.map(c => <ClinicRow key={c.id} c={c} open={open === c.id} busy={busy} overdue={overdue(c)} toggle={() => setOpen(open === c.id ? '' : c.id)} suspend={() => suspend(c)} reactivate={() => update(c, { status: 'active' }, `${c.name} reactivated.`)} billing={e => billing(e, c)} invite={e => invite(e, c)} ownerFields={owner(c)} />)}</tbody></table></div>}
    </section>
    <section><h2>Create a clinic</h2><p>The owner gets an email to choose a password, then sets up staff, hours, procedures and prices themselves. Currency is PKR.</p>
      <form onSubmit={create}><div className="form-row"><label>Clinic name<input name="name" required minLength={2} maxLength={120} disabled={busy} /></label><label>City<input name="city" maxLength={80} disabled={busy} /></label><label>Clinic phone<input name="phone" maxLength={30} pattern="[0-9+() \-]*" inputMode="tel" disabled={busy} /></label><label>First branch name<input name="branchName" required minLength={2} maxLength={80} defaultValue="Main branch" disabled={busy} /></label><label>Timezone<input name="timezone" required defaultValue="Asia/Karachi" disabled={busy} /></label></div>
        <div className="form-row">{owner()}</div>
        <div className="form-row"><label>Plan note (optional)<input name="planNote" maxLength={500} placeholder="e.g. Standard, PKR 5,000/month, Easypaisa" disabled={busy} /></label><label>Paid until (optional)<input name="paidUntil" type="date" disabled={busy} /></label></div>
        <button disabled={busy}>{busy ? 'Working…' : 'Create clinic and invite owner'}</button></form>
    </section>
  </main>;
}
function ClinicRow({ c, open, busy, overdue, toggle, suspend, reactivate, billing, invite, ownerFields }: { c: Clinic; open: boolean; busy: boolean; overdue: boolean; toggle: () => void; suspend: () => void; reactivate: () => void; billing: (e: FormEvent<HTMLFormElement>) => void; invite: (e: FormEvent<HTMLFormElement>) => void; ownerFields: React.ReactNode }) {
  return <><tr className={c.status === 'active' ? '' : 'inactive'}>
    <td><strong>{c.name}</strong><span className="muted">{c.city && ` · ${c.city}`}{c.phone && ` · ${c.phone}`}</span>{c.planNote && <div className="muted">{c.planNote}</div>}</td>
    <td>{c.status === 'active' ? 'Active' : <strong>Suspended</strong>}</td>
    <td>{c.paidUntil ?? '—'}{overdue && <strong> · overdue</strong>}</td>
    <td>{ownerLine(c)}</td><td>{c.staffCount}</td>
    <td className="row-actions"><button className="secondary" disabled={busy} onClick={toggle}>{open ? 'Close' : 'Manage'}</button>{c.status === 'active' ? <button className="secondary" disabled={busy} onClick={suspend}>Suspend</button> : <button disabled={busy} onClick={reactivate}>Reactivate</button>}</td>
  </tr>{open && <tr><td colSpan={6}>
    <form onSubmit={billing}><h3>Subscription</h3><div className="form-row"><label>Plan note<input name="planNote" maxLength={500} defaultValue={c.planNote} disabled={busy} /></label><label>Paid until<input name="paidUntil" type="date" defaultValue={c.paidUntil ?? ''} disabled={busy} /></label></div><button disabled={busy}>Save subscription details</button></form>
    <form onSubmit={invite}><h3>{c.inviteStatus === 'accepted' ? 'Invite another owner' : 'Change or resend the owner invite'}</h3><div className="form-row">{ownerFields}</div><button disabled={busy}>Send owner invite</button></form>
    <History clinicId={c.id} stamp={`${c.status}|${c.planNote}|${c.paidUntil}|${c.ownerEmail}|${c.inviteDelivery}`} />
  </td></tr>}</>;
}
function History({ clinicId, stamp }: { clinicId: string; stamp: string }) {
  const [events, setEvents] = useState<Event[] | null>(null); const [error, setError] = useState('');
  useEffect(() => { let live = true; api(`/api/v1/operator/clinics/${clinicId}`).then(d => { if (live) { setEvents(d.events); setError(''); } }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [clinicId, stamp]);
  return <div><h3>Operator history</h3>{error && <p role="alert" className="staff-error">{error}</p>}{!events ? <p role="status" className="loading">Loading history…</p> : <ul>{events.map(e => <li key={e.id}><span>{actions[e.action] ?? e.action}</span><span className="muted">{e.operatorName} · {when(e.occurredAt)}</span></li>)}</ul>}</div>;
}
