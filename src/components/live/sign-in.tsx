'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { BrandName } from '@/components/brand';
import { ThemeToggle } from '@/components/theme';

type Props = {
  busy: boolean;
  error: string;
  notice: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onForgot: (form: HTMLFormElement | null) => void;
};

export function SignIn({ busy, error, notice, onSubmit, onForgot }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const [reveal, setReveal] = useState(false);
  return <main className="signin">
    <div className="staff-workspace signin-panel">
      <div className="brand"><BrandName /></div>
      <div className="signin-body">
        <h1>Sign in to your clinic</h1>
        <p>Use the email address your clinic invited you with.</p>
        {error && <p role="alert" className="staff-error">{error}</p>}
        {notice && <p role="status" className="signin-notice">{notice}</p>}
        <form ref={form} onSubmit={onSubmit}>
          <label>Email<input name="email" type="email" autoComplete="username" inputMode="email" required maxLength={254} autoFocus /></label>
          <div className="signin-label-row">
            <label htmlFor="signin-password">Password</label>
            <button type="button" className="text-button" disabled={busy} onClick={() => onForgot(form.current)}>Forgot password?</button>
          </div>
          <div className="password-field">
            <input id="signin-password" name="password" type={reveal ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} />
            <button type="button" className="reveal" aria-pressed={reveal} aria-label={reveal ? 'Hide password' : 'Show password'} onClick={() => setReveal(r => !r)}>
              {reveal ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
            </button>
          </div>
          <button className="signin-submit" disabled={busy} aria-busy={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="signin-help">No account yet? Your clinic owner can invite you from <strong>Staff and access</strong>.</p>
      </div>
      <div className="signin-foot"><ThemeToggle /></div>
    </div>
    <aside className="signin-art" aria-hidden="true">
      <ToothChart />
      <p className="signin-art-line">One record for the front desk and the chair.</p>
      <p className="signin-art-sub">Appointments, visits, treatment plans, billing and the day’s closing, for every branch of your clinic.</p>
    </aside>
  </main>;
}

/* ---------- Tooth chart ----------
   Both arches seen from above, numbered with the FDI system dentists use in Pakistan. Viewed facing the
   patient, so the patient's right (quadrants 1 and 4) is on the left. Teeth are spaced by real relative widths. */
type Tooth = { n: number; x: number; y: number; w: number; d: number; rot: number; lx: number; ly: number };

// Relative mesiodistal width and occlusal depth by tooth position (1 = central incisor … 8 = third molar).
const width = [0, 8.6, 6.6, 7.6, 7, 6.8, 10.2, 9.6, 9];
const depth = [0, 6.8, 6.2, 8, 8.8, 8.8, 11, 10.6, 10];

function arch(upper: boolean): Tooth[] {
  const cx = 200, cy = upper ? 196 : 224, rx = 136, ry = 152, steps = 600;
  // Sample the half-ellipse and its cumulative length so teeth sit at true arc distances.
  const pts: { x: number; y: number; s: number }[] = [];
  for (let i = 0, s = 0; i <= steps; i++) {
    const t = Math.PI - (Math.PI * i) / steps;
    const x = cx + rx * Math.cos(t), y = upper ? cy - ry * Math.sin(t) : cy + ry * Math.sin(t);
    if (i) s += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y);
    pts.push({ x, y, s });
  }
  const length = pts[steps].s;
  const left = upper ? [18, 17, 16, 15, 14, 13, 12, 11] : [48, 47, 46, 45, 44, 43, 42, 41];
  const right = upper ? [21, 22, 23, 24, 25, 26, 27, 28] : [31, 32, 33, 34, 35, 36, 37, 38];
  const order = [...left, ...right];
  const total = order.reduce((sum, n) => sum + width[n % 10], 0);
  const scale = length / total;
  let run = 0;
  return order.map(n => {
    const w = width[n % 10] * scale, d = depth[n % 10] * scale * 0.95;
    const at = run + w / 2; run += w;
    const i = Math.min(steps - 1, pts.findIndex(p => p.s >= at));
    const a = pts[Math.max(0, i - 1)], b = pts[i + 1] ?? pts[i];
    const rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const p = pts[i];
    // Label sits outside the arch, along the normal.
    const nx = p.x - cx, ny = p.y - cy, len = Math.hypot(nx, ny) || 1;
    const off = d / 2 + 11;
    return { n, x: p.x, y: p.y, w: w * 0.9, d, rot, lx: p.x + (nx / len) * off, ly: p.y + (ny / len) * off };
  });
}

const teeth = [...arch(true), ...arch(false)];
const done = new Set([16, 26, 46]);
const planned = new Set([36, 11]);

function ToothChart() {
  return <svg className="tooth-chart" viewBox="20 10 360 400" role="presentation">
    {teeth.map((t, i) => <g key={t.n} className={done.has(t.n) ? 'tooth done' : planned.has(t.n) ? 'tooth planned' : 'tooth'} style={{ animationDelay: `${i * 22}ms` }}>
      <rect x={t.x - t.w / 2} y={t.y - t.d / 2} width={t.w} height={t.d} rx={Math.min(t.w, t.d) * 0.38} transform={`rotate(${t.rot} ${t.x} ${t.y})`} />
      <text x={t.lx} y={t.ly} dominantBaseline="central" textAnchor="middle">{t.n}</text>
    </g>)}
    <line className="midline" x1="200" y1="28" x2="200" y2="392" />
  </svg>;
}
