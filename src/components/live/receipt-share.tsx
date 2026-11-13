'use client';
import { useState } from 'react';
import { Download, MessageCircle, Share2 } from 'lucide-react';
import { receiptPdf, type ReceiptForPdf } from '@/lib/receipt-pdf';
import { api, scopeHeaders, useClinic } from './session';
import { openIn } from './whatsapp';

type Kind = 'payment' | 'refund';
type ApiReceipt = { number: string; reason?: string; logo?: { dataUrl: string } | null; snapshot: ReceiptForPdf['snapshot'] };

// The logo is stored as WebP/PNG; PDFs embed JPEG directly, so it is redrawn on white and re-encoded here.
async function logoAsJpeg(dataUrl: string) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
  const bin = atob(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
  return { bytes: Uint8Array.from(bin, ch => ch.charCodeAt(0)), width: c.width, height: c.height };
}
async function buildPdf(r: ApiReceipt, kind: Kind) {
  const bytes = receiptPdf({ number: r.number, kind, reason: r.reason, snapshot: r.snapshot, logoJpeg: r.logo?.dataUrl ? await logoAsJpeg(r.logo.dataUrl).catch(() => null) : null });
  return new File([bytes as BlobPart], `${kind === 'refund' ? 'Refund' : 'Receipt'} ${r.number}.pdf`, { type: 'application/pdf' });
}
function download(file: File) {
  const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
// Phones, tablets and some desktop browsers can hand a file to WhatsApp through the system share sheet.
const canShareFiles = () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });

// Sends the receipt PDF on WhatsApp. Where the browser can share files, the share sheet opens with the PDF and the
// receipt message attached. Otherwise the PDF is saved and the patient's WhatsApp chat opens with the message ready,
// so staff drag the PDF in. The message is built (and the contact preferences checked and audited) on the server.
export function SendReceiptPdf({ receiptId, patientId, kind = 'payment', compact = false }: { receiptId: string; patientId: string; kind?: Kind; compact?: boolean }) {
  const { scope, can } = useClinic();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ file: File; text: string } | null>(null);
  if (!can('billing.read') || !can('communication.send') || kind !== 'payment') return null;
  async function share(file: File, text: string) {
    try { await navigator.share({ files: [file], text }); setPending(null); setNotice('Receipt shared.'); }
    catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setPending(null); return; } // closed the share sheet
      // Preparing the PDF took long enough that the browser wants a fresh tap before sharing.
      if (e instanceof DOMException && e.name === 'NotAllowedError') { setPending({ file, text }); return; }
      throw e;
    }
  }
  async function send() {
    if (busy) return;
    const viaShare = canShareFiles();
    const tab = viaShare ? null : window.open('', '_blank');
    setBusy(true); setError(''); setNotice(''); setPending(null);
    try {
      const h = { headers: scopeHeaders(scope) };
      const [data, link] = await Promise.all([
        api(`/api/v1/receipts/${receiptId}`, h),
        api('/api/v1/communications/whatsapp-link', { ...h, method: 'POST', body: JSON.stringify({ patientId, template: 'payment_received', receiptId }) }),
      ]);
      const file = await buildPdf(data.receipt, kind);
      if (viaShare) await share(file, link.text);
      else { download(file); openIn(tab, link.url); setNotice(`“${file.name}” is in your Downloads. Drag it into the WhatsApp chat that just opened, then press send.`); }
    } catch (e) { tab?.close(); setError(e instanceof Error ? e.message : 'The receipt could not be prepared.'); }
    finally { setBusy(false); }
  }
  return <div className={`wa-actions${compact ? ' compact' : ''}`}>
    {pending
      ? <button type="button" className="wa-button" onClick={() => void share(pending.file, pending.text).catch(e => setError(e instanceof Error ? e.message : 'Sharing failed.'))}><Share2 size={15} aria-hidden />Share PDF now</button>
      : <button type="button" className="wa-button" disabled={busy} onClick={() => void send()} title="Send the receipt PDF on WhatsApp"><MessageCircle size={15} aria-hidden />{busy ? 'Preparing…' : compact ? 'WhatsApp PDF' : 'Send PDF on WhatsApp'}</button>}
    {error && <p role="alert" className="staff-error">{error}</p>}
    {notice && <p role="status" className="wa-notice">{notice}</p>}
  </div>;
}

// Saves the receipt as a PDF file, for email or printing later.
export function DownloadReceiptPdf({ receiptId, kind = 'payment' }: { receiptId: string; kind?: Kind }) {
  const { scope } = useClinic(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function run() {
    if (busy) return; setBusy(true); setError('');
    try { const data = await api(`/api/v1/${kind === 'refund' ? 'refunds' : 'receipts'}/${receiptId}`, { headers: scopeHeaders(scope) }); download(await buildPdf(data.receipt, kind)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The PDF could not be made.'); } finally { setBusy(false); }
  }
  return <><button type="button" className="secondary" disabled={busy} onClick={() => void run()}><Download size={15} aria-hidden />{busy ? 'Preparing…' : 'Download PDF'}</button>{error && <p role="alert" className="staff-error">{error}</p>}</>;
}
