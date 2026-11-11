'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { deliveryText, type InviteDelivery } from '@/lib/operator/contracts';
import { permissionGroups, roleLabels } from '@/lib/staff/contracts';
import { api, scopeHeaders, useClinic } from './session';
type Member = { id: string; name: string; active: boolean; isSelf: boolean; joinedAt: string; roleNames: string[]; grants: string[]; branchIds: string[] };
type Data = { members: Member[]; roles: { name: string; permissions: string[] }[]; branches: { id: string; name: string; active: boolean }[]; permissions: { key: string; description: string }[]; invites: { id: string; email: string; displayName: string; roleNames: string[]; branchId: string; delivery: InviteDelivery; createdAt: string }[] };
const label = (role: string) => roleLabels[role] ?? role;
export function TeamAdmin() {
  const { scope, can } = useClinic(); const allowed = can('user.manage');
  const [data, setData] = useState<Data | null>(null); const [revision, setRevision] = useState(0); const [editing, setEditing] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { if (!allowed) return; const c = new AbortController(); api('/api/v1/team', { headers: scopeHeaders(scope), signal: c.signal }).then(d => { if (!c.signal.aborted) setData(d); }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [scope, revision, allowed]);
  async function run(task: () => Promise<string>) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { setNotice(await task()); setRevision(n => n + 1); } catch (e) { setError(e instanceof Error ? e.message : 'The change could not be saved.'); } finally { setBusy(false); } }
  function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    void run(async () => { const { invite } = await api('/api/v1/team', { method: 'POST', headers: scopeHeaders(scope), body: JSON.stringify({ operationId: crypto.randomUUID(), email: f.get('email'), displayName: f.get('displayName'), roleNames: f.getAll('roleNames'), branchId: f.get('branchId') }) }); form.reset(); return `Invite saved. ${deliveryText[invite.delivery as InviteDelivery]}.`; });
  }
  function save(e: FormEvent<HTMLFormElement>, m: Member, active = m.active) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    void run(async () => { await api(`/api/v1/team/${m.id}`, { method: 'PATCH', headers: scopeHeaders(scope), body: JSON.stringify({ operationId: crypto.randomUUID(), roleNames: f.getAll('roleNames'), grants: f.getAll('grants'), branchIds: f.getAll('branchIds'), active }) }); setEditing(''); return `${m.name}'s access was updated. It applies from their next action.`; });
  }
  const setActive = (m: Member, active: boolean) => { if (!active && !window.confirm(`Deactivate ${m.name}? They will be blocked from this clinic at once. Their past records stay.`)) return; void run(async () => { await api(`/api/v1/team/${m.id}`, { method: 'PATCH', headers: scopeHeaders(scope), body: JSON.stringify({ operationId: crypto.randomUUID(), roleNames: m.roleNames, grants: m.grants, branchIds: m.branchIds, active }) }); return active ? `${m.name} can sign in again.` : `${m.name} is deactivated.`; }); };
  const revoke = (id: string) => run(async () => { await api(`/api/v1/team/invites/${id}`, { method: 'DELETE', headers: scopeHeaders(scope) }); return 'Invite cancelled.'; });
  if (!allowed) return <section className="staff-workspace live-inner"><h1>Staff and access</h1><p>Only staff who manage users can open this page.</p></section>;
  if (!data) return <div className="staff-workspace live-inner"><h1>Staff and access</h1>{error ? <p role="alert" className="staff-error">{error}</p> : <p role="status">Loading staff…</p>}</div>;
  const fromRoles = (names: string[]) => new Set(data.roles.filter(r => names.includes(r.name)).flatMap(r => r.permissions));
  const branchName = (id: string) => data.branches.find(b => b.id === id)?.name ?? 'Branch';
  return <div className="staff-workspace live-inner"><div className="page-heading"><div><p className="eyebrow">Clinic setup</p><h1>Staff and access</h1></div></div>
    <p>Invite your team, choose what each person can do, and deactivate people who leave. Every change is recorded in the audit log.</p>
    {error && <p role="alert" className="staff-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section><h2>Staff</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Roles</th><th>Branches</th><th>Status</th><th></th></tr></thead><tbody>{data.members.map(m => editing === m.id ? <tr key={m.id}><td colSpan={5}><MemberForm m={m} data={data} busy={busy} inherited={fromRoles} onSubmit={e => save(e, m)} onCancel={() => setEditing('')} /></td></tr> : <tr key={m.id} className={m.active ? '' : 'inactive'}>
      <td><strong>{m.name}</strong>{m.isSelf && <span className="muted"> · you</span>}</td><td>{m.roleNames.map(label).join(', ') || '—'}{m.grants.length > 0 && <span className="muted"> · +{m.grants.length} extra</span>}</td><td>{m.branchIds.map(branchName).join(', ')}</td><td>{m.active ? 'Active' : <strong>Deactivated</strong>}</td>
      <td className="row-actions"><button className="secondary" disabled={busy} onClick={() => setEditing(m.id)}>Edit access</button>{!m.isSelf && <button className="secondary" disabled={busy} onClick={() => setActive(m, !m.active)}>{m.active ? 'Deactivate' : 'Reactivate'}</button>}</td></tr>)}</tbody></table></div></section>
    {data.invites.length > 0 && <section><h2>Pending invites</h2><ul>{data.invites.map(i => <li key={i.id}><div><strong>{i.displayName} · {i.email}</strong><p>{i.roleNames.map(label).join(', ')} · {branchName(i.branchId)} · {deliveryText[i.delivery]}</p></div><button className="secondary" disabled={busy} onClick={() => revoke(i.id)}>Cancel invite</button></li>)}</ul></section>}
    <section><h2>Invite a staff member</h2><p>They get an email to choose a password. Access starts the first time they sign in with this email address.</p>
      <form onSubmit={invite}><div className="form-row"><label>Full name<input name="displayName" required minLength={2} maxLength={120} disabled={busy} /></label><label>Email<input name="email" type="email" required maxLength={254} disabled={busy} /></label><label>Branch<select name="branchId" defaultValue={scope.branchId} disabled={busy}>{data.branches.filter(b => b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
        <fieldset disabled={busy}><legend>Roles</legend>{data.roles.map(r => <label key={r.name} className="checkbox"><input type="checkbox" name="roleNames" value={r.name} />{label(r.name)}</label>)}</fieldset>
        <button disabled={busy}>{busy ? 'Working…' : 'Send invite'}</button></form></section>
  </div>;
}
function MemberForm({ m, data, busy, inherited, onSubmit, onCancel }: { m: Member; data: Data; busy: boolean; inherited: (names: string[]) => Set<string>; onSubmit: (e: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const [roleNames, setRoleNames] = useState(m.roleNames); const fromRole = inherited(roleNames);
  return <form onSubmit={onSubmit}><h3>Access for {m.name}</h3>
    <fieldset disabled={busy}><legend>Roles</legend>{data.roles.map(r => <label key={r.name} className="checkbox"><input type="checkbox" name="roleNames" value={r.name} checked={roleNames.includes(r.name)} onChange={e => setRoleNames(e.target.checked ? [...roleNames, r.name] : roleNames.filter(n => n !== r.name))} />{label(r.name)}</label>)}</fieldset>
    <fieldset disabled={busy}><legend>Branches</legend>{data.branches.map(b => <label key={b.id} className="checkbox"><input type="checkbox" name="branchIds" value={b.id} defaultChecked={m.branchIds.includes(b.id)} />{b.name}</label>)}</fieldset>
    <p>Extra permissions for this person only. Ticked and greyed items already come from their roles.</p>
    {permissionGroups.map(g => { const items = data.permissions.filter(p => g.prefix.some(x => p.key.startsWith(x))); return items.length ? <fieldset key={g.name} disabled={busy}><legend>{g.name}</legend>{items.map(p => fromRole.has(p.key) ? <label key={p.key} className="checkbox muted"><input type="checkbox" checked disabled readOnly />{p.description}</label> : <label key={p.key} className="checkbox"><input type="checkbox" name="grants" value={p.key} defaultChecked={m.grants.includes(p.key)} />{p.description}</label>)}</fieldset> : null; })}
    <button disabled={busy}>{busy ? 'Saving…' : 'Save access'}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></form>;
}
