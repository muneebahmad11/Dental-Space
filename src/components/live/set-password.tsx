'use client';
import { BrandName } from '@/components/brand';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from './session';
export function SetPassword({ expired }: { expired: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return;
    const form = new FormData(e.currentTarget); const password = String(form.get('password'));
    if (password !== form.get('confirm')) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError('');
    try { await api('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); setDone(true); }
    catch (e) { setError(e instanceof Error && 'status' in e && e.status === 401 ? 'This link has expired or was already used. Ask for a new one from the sign-in page.' : e instanceof Error ? e.message : 'Password could not be saved.'); }
    finally { setBusy(false); }
  }
  return <main className="staff-workspace live-login"><div className="brand"><BrandName /></div><section>
    <h1>Choose your password</h1>
    {expired ? <><p role="alert" className="staff-error">This link has expired or was already used.</p><p>Open the sign-in page and choose “Forgot password” to get a new link.</p><p><Link href="/">Go to sign-in</Link></p></>
      : done ? <><p role="status">Password saved. You are signed in.</p><p><Link href="/">Open your clinic</Link></p></>
      : <><p>Use at least 10 characters. You will sign in with your email and this password.</p>{error && <p role="alert" className="staff-error">{error}</p>}
        <form onSubmit={save}><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={256} /></label><label>Repeat password<input name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={256} /></label><button disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button></form></>}
  </section></main>;
}
