'use client';
import { useEffect, useState } from 'react';
import { api, scopeHeaders, useClinic } from './session';
// The methods this clinic has enabled, for payment and expense forms.
export function usePaymentMethods() {
  const { scope } = useClinic(); const [methods, setMethods] = useState<string[] | null>(null);
  useEffect(() => { const c = new AbortController(); api('/api/v1/clinic/payment-methods', { headers: scopeHeaders(scope), signal: c.signal }).then(d => { if (!c.signal.aborted) setMethods(d.methods.map((m: { name: string }) => m.name)); }).catch(() => { if (!c.signal.aborted) setMethods([]); }); return () => c.abort(); }, [scope]);
  return methods;
}
export function MethodSelect({ disabled }: { disabled?: boolean }) {
  const methods = usePaymentMethods();
  return <select name="method" required disabled={disabled || !methods?.length}>{methods === null ? <option value="">Loading…</option> : methods.length === 0 ? <option value="">No payment methods enabled</option> : methods.map(v => <option key={v}>{v}</option>)}</select>;
}
