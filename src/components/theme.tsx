'use client';
import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';
const storageKey = 'theme';
const order: Theme[] = ['system', 'light', 'dark'];
const labels: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };

// Runs in <head> before first paint so a saved dark preference never flashes light.
export const themeInitScript = `try{var t=localStorage.getItem('${storageKey}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;

function readTheme(): Theme {
  try { const t = localStorage.getItem(storageKey); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme; else root.dataset.theme = theme;
  try { if (theme === 'system') localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, theme); } catch { /* preference simply isn't remembered */ }
  listeners.forEach(l => l());
}
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

// Cycles System → Light → Dark. "System" follows the device setting.
export function ThemeToggle() {
  const current = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);
  const next = order[(order.indexOf(current) + 1) % order.length];
  const Icon = current === 'dark' ? Moon : current === 'light' ? Sun : Monitor;
  return <button type="button" className="theme-toggle secondary" title={`${labels[current]} — switch to ${labels[next].toLowerCase()}`} aria-label={`${labels[current]}. Switch to ${labels[next].toLowerCase()}`}
    onClick={() => applyTheme(next)}><Icon size={16} aria-hidden /><span>{current === 'system' ? 'Auto' : current === 'light' ? 'Light' : 'Dark'}</span></button>;
}
