// Builds a one-page A5 receipt PDF in the browser without any library. It uses the PDF standard fonts
// (Helvetica, which every PDF reader has), straight lines, and the clinic logo as a JPEG image.
// Text is limited to the Latin (WinAnsi) character set; other characters print as "?".
import { rupees } from './messaging/templates.ts';
import { patientRef } from './display.ts';

export type ReceiptForPdf = {
  number: string; kind: 'payment' | 'refund'; reason?: string; logoJpeg?: { bytes: Uint8Array; width: number; height: number } | null;
  snapshot: {
    clinicName: string; branchName: string; clinicAddress?: string; clinicPhone?: string; receiptHeader?: string; receiptFooter?: string; ntn?: string;
    patientName: string; patientDisplayId: string; method: string; paidOn: string; amountMinor: number;
    chargedMinor: string; creditedMinor?: string; paidMinor: string; balanceMinor: string; allocations: { chargeId: string; description: string; amountMinor: number }[];
  };
};

// Advance widths (per 1000 em) of the standard fonts for characters 32–126, from Adobe's font metrics.
const regular = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const bold = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const extra: Record<string, [number, number]> = { '•': [0x95, 350], '–': [0x96, 556], '—': [0x97, 1000], '·': [0xb7, 278], '’': [0x92, 222], '‘': [0x91, 222], '“': [0x93, 333], '”': [0x94, 333], '−': [0x2d, 333] };
function encode(text: string, isBold: boolean): { bytes: number[]; width: number } {
  const bytes: number[] = []; let width = 0; const table = isBold ? bold : regular;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) { bytes.push(c); width += table[c - 32]; }
    else if (extra[ch]) { bytes.push(extra[ch][0]); width += extra[ch][1]; }
    else if (c >= 160 && c <= 255) { bytes.push(c); width += 556; } // Latin-1 letters (é, ü…) share WinAnsi codes
    else { bytes.push(63); width += table[63 - 32]; }
  }
  return { bytes, width };
}
const hex = (bytes: number[]) => bytes.map(b => b.toString(16).padStart(2, '0')).join('');
const longDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export function receiptPdf(r: ReceiptForPdf): Uint8Array {
  const W = 420, H = 595, M = 32; // A5 portrait, in points
  const ink = '0.09 0.13 0.17', muted = '0.31 0.36 0.42', rule = '0.80 0.83 0.86';
  const ops: string[] = []; let y = H - M;
  const widthOf = (t: string, size: number, b = false) => encode(t, b).width * size / 1000;
  const text = (t: string, x: number, at: number, size: number, b = false, color = ink) => { ops.push(`BT ${color} rg /${b ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${at.toFixed(2)} Td <${hex(encode(t, b).bytes)}> Tj ET`); };
  const right = (t: string, xr: number, at: number, size: number, b = false, color = ink) => text(t, xr - widthOf(t, size, b), at, size, b, color);
  const line = (x1: number, at: number, x2: number, weight = 0.6, color = rule) => ops.push(`${color} RG ${weight} w ${x1} ${at.toFixed(2)} m ${x2} ${at.toFixed(2)} l S`);
  const wrap = (t: string, max: number, size: number, b = false) => {
    const out: string[] = []; let cur = '';
    for (const word of t.split(/\s+/).filter(Boolean)) { const next = cur ? `${cur} ${word}` : word; if (widthOf(next, size, b) > max && cur) { out.push(cur); cur = word; } else cur = next; }
    if (cur) out.push(cur); return out.length ? out : [''];
  };
  const s = r.snapshot; const refund = r.kind === 'refund';

  // Letterhead: logo on the left, clinic details beside it.
  let textX = M;
  if (r.logoJpeg) {
    const scale = Math.min(110 / r.logoJpeg.width, 48 / r.logoJpeg.height); const w = r.logoJpeg.width * scale, h = r.logoJpeg.height * scale;
    ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${M} ${(y - h).toFixed(2)} cm /Im1 Do Q`); textX = M + w + 14;
  }
  let ty = y - 13;
  for (const l of wrap(s.clinicName, W - M - textX, 15, true)) { text(l, textX, ty, 15, true); ty -= 17; }
  if (s.receiptHeader) { text(s.receiptHeader, textX, ty, 8.5, true); ty -= 11; }
  for (const l of [[s.clinicAddress, s.branchName].filter(Boolean).join(' · '), [s.clinicPhone && `Phone ${s.clinicPhone}`, s.ntn && `NTN ${s.ntn}`].filter(Boolean).join(' · ')].filter(Boolean))
    for (const w of wrap(l, W - M - textX, 8.5)) { text(w, textX, ty, 8.5, false, muted); ty -= 11; }
  y = Math.min(ty, y - (r.logoJpeg ? 52 : 0)) - 6; line(M, y, W - M, 1.4, ink); y -= 26;

  // Title and receipt facts.
  text(refund ? 'Refund confirmation' : 'Payment receipt', M, y, 16, true);
  const facts: [string, string][] = [['Receipt no.', r.number], ['Date', longDate(s.paidOn)], ['Method', s.method]];
  // Receipt numbers are long, so the facts sit in rows under the title rather than beside it.
  y -= 22; for (const [k, v] of facts) { text(k, M, y, 8.5, false, muted); text(v, M + 62, y, 9, true); y -= 13; }
  y -= 4; line(M, y, W - M); y -= 16;
  text('Patient', M, y, 8.5, false, muted); text(s.patientName, M + 44, y, 10, true); text(patientRef(s.patientDisplayId), M + 50 + widthOf(s.patientName, 10, true), y, 8.5, false, muted);
  y -= 10; line(M, y, W - M); y -= 22;

  // What the money was for.
  text(refund ? 'Returned from' : 'Paid for', M, y, 8.5, true, muted); right('Amount', W - M, y, 8.5, true, muted); y -= 6; line(M, y, W - M, 0.8, '0.60 0.65 0.70'); y -= 15;
  for (const a of s.allocations.length ? s.allocations : [{ chargeId: '-', description: 'Payment on account', amountMinor: s.amountMinor }]) {
    const rows = wrap(a.description, W - 2 * M - 90, 10); rows.forEach((l, i) => text(l, M, y - i * 13, 10)); right(rupees(a.amountMinor), W - M, y, 10);
    y -= rows.length * 13 + 4; line(M, y + 6, W - M, 0.4); y -= 8;
  }
  y -= 4; text(refund ? 'Amount returned' : 'Amount received', M, y, 12, true); right(rupees(s.amountMinor), W - M, y, 14, true); y -= 8; line(M, y, W - M, 1.4, ink); y -= 22;
  if (r.reason) { for (const l of wrap(`Reason: ${r.reason}`, W - 2 * M, 9)) { text(l, M, y, 9, false, muted); y -= 12; } y -= 6; }

  // The account after this payment, so the patient sees what is still owed.
  text('Account after this receipt', M, y, 8.5, true, muted); y -= 15;
  const credited = s.creditedMinor && s.creditedMinor !== '0' ? s.creditedMinor : null;
  for (const [k, v, b] of [['Total charges', rupees(s.chargedMinor), false], ...(credited ? [['Credit notes', `- ${rupees(credited)}`, false]] : []), ['Total paid', rupees(s.paidMinor), false], ['Balance still owed', rupees(s.balanceMinor), true]] as [string, string, boolean][]) {
    text(k, M, y, 10, b, b ? ink : muted); right(v, W - M, y, 10, b); y -= 15;
  }

  // Footer pinned to the bottom of the page.
  let by = M + 4;
  if (s.receiptFooter) for (const l of wrap(s.receiptFooter, W - 2 * M, 8.5).reverse()) { const w = widthOf(l, 8.5); text(l, (W - w) / 2, by + 12, 8.5, false, muted); by += 11; }
  line(M, by + 22, W - M, 0.4);
  const note = 'Computer-generated receipt. No signature required.'; text(note, (W - widthOf(note, 7.5)) / 2, M - 6, 7.5, false, muted);

  return assemble(W, H, ops.join('\n'), r.logoJpeg ?? null);
}

// Writes the PDF objects and the cross-reference table that lets readers find them.
function assemble(W: number, H: number, content: string, image: { bytes: Uint8Array; width: number; height: number } | null): Uint8Array {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const offsets: number[] = []; let size = 0;
  const push = (p: Uint8Array | string) => { const b = typeof p === 'string' ? enc.encode(p) : p; parts.push(b); size += b.length; };
  const obj = (n: number, body: (Uint8Array | string)[]) => { offsets[n] = size; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${image ? ' /XObject << /Im1 7 0 R >>' : ''} >> >>`]);
  const stream = enc.encode(content);
  obj(4, [`<< /Length ${stream.length} >>\nstream\n`, stream, '\nendstream']);
  obj(5, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  obj(6, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
  if (image) obj(7, [`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`, image.bytes, '\nendstream']);
  const count = image ? 8 : 7; const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n${Array.from({ length: count - 1 }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out;
}
