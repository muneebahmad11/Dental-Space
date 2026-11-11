'use client';
import { useEffect, useRef } from 'react';
export const idleMinutes = 30;
const key = 'clinic-last-activity';
// Signs the person out after 30 minutes without any activity, in every open tab of the app.
// A shared clinic computer left unattended must not stay open on patient records.
export function useIdleSignOut(enabled: boolean, onIdle: () => void) {
  const callback = useRef(onIdle); useEffect(() => { callback.current = onIdle; });
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const mark = () => { const now = Date.now(); if (now - last < 5000) return; last = now; try { localStorage.setItem(key, String(now)); } catch { /* private mode: this tab still tracks itself */ } };
    const latest = () => { try { return Math.max(last, Number(localStorage.getItem(key)) || 0); } catch { return last; } };
    last = Date.now(); try { localStorage.setItem(key, String(last)); } catch { /* ignore */ }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true });
    const check = () => { if (Date.now() - latest() >= idleMinutes * 60000) callback.current(); };
    const timer = window.setInterval(check, 30000); document.addEventListener('visibilitychange', check);
    return () => { for (const e of events) window.removeEventListener(e, mark); window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [enabled]);
}
