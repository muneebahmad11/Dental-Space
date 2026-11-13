'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// A thin bar along the top of the window while a link navigation is pending.
// It starts on a click of an internal link (or Back/Forward) and finishes when the URL changes.
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page or hash link
      setState('running');
    }
    const onPop = () => setState('running');
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('popstate', onPop); };
  }, []);

  // URL changed: the new page has rendered, so complete the bar and fade it out.
  const url = `${pathname}?${search}`;
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) { setLastUrl(url); if (state === 'running') setState('done'); }

  useEffect(() => {
    if (state === 'done') { const t = setTimeout(() => setState('idle'), 350); return () => clearTimeout(t); }
    if (state === 'running') { const t = setTimeout(() => setState('idle'), 15000); return () => clearTimeout(t); } // never stick
  }, [state]);

  return <div className="nav-progress" data-state={state} aria-hidden="true"><span /></div>;
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
