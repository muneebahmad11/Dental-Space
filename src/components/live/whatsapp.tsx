'use client';
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { messageTemplates, type TemplateKey } from '@/lib/messaging/templates';
import { api, scopeHeaders, useClinic } from './session';

type Target = { appointmentId?: string; receiptId?: string; planId?: string };
// Points the tab opened during the click at WhatsApp, cut off from this page; falls back to this tab if blocked.
export function openIn(tab: Window | null, url: string) { if (tab) { tab.opener = null; tab.location.replace(url); } else window.location.assign(url); }

// Opens WhatsApp (web or app) with the clinic's message already written for this patient. Staff review and send it.
// The tab is opened during the click so browsers don't block it, then pointed at the link the server built.
export function WhatsAppButtons({ patientId, templates, target = {}, compact = false }: { patientId: string; templates: TemplateKey[]; target?: Target; compact?: boolean }) {
  const { scope, can } = useClinic();
  const [busy, setBusy] = useState<TemplateKey | null>(null);
  const [error, setError] = useState('');
  // Show only messages this person may prepare; the server checks the same access again.
  const needs = { appointment: ['appointment.read'], balance: ['billing.read'], receipt: ['billing.read'], plan: ['plan.read', 'patient.clinical.read'] } as const;
  const allowed = templates.filter(t => { const n = messageTemplates[t].need; return !n || needs[n].every(p => can(p)); });
  if (!can('communication.send') || !allowed.length) return null;
  async function open(template: TemplateKey) {
    if (busy) return;
    const tab = window.open('', '_blank');
    setBusy(template); setError('');
    try {
      const data = await api('/api/v1/communications/whatsapp-link', { method: 'POST', headers: scopeHeaders(scope), body: JSON.stringify({ patientId, template, ...target }) });
      openIn(tab, data.url);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'The WhatsApp message could not be prepared.');
    } finally { setBusy(null); }
  }
  return <div className={`wa-actions${compact ? ' compact' : ''}`}>
    {allowed.map(t => <button key={t} type="button" className="wa-button" disabled={busy !== null} onClick={() => void open(t)} title={`Open WhatsApp with the “${messageTemplates[t].label}” message`}>
      <MessageCircle size={15} aria-hidden />{busy === t ? 'Opening…' : compact ? 'WhatsApp' : messageTemplates[t].label}
    </button>)}
    {error && <p role="alert" className="staff-error">{error}</p>}
  </div>;
}
