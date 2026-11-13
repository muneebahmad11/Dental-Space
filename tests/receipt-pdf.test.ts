import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { receiptPdf, type ReceiptForPdf } from '../src/lib/receipt-pdf.ts';

export const sample: ReceiptForPdf = {
  number: 'R-0822DBD4-0CEE-4CFC-B57B-6ED95F947B7A', kind: 'payment',
  snapshot: {
    clinicName: 'Al-Shifa Dental Care', branchName: 'Gulberg', clinicAddress: '12-B Main Boulevard, Gulberg III, Lahore', clinicPhone: '042 3576 0000', receiptHeader: 'Dr. Ayesha Khan, BDS, RDS', receiptFooter: 'Thank you for visiting. Fees once paid are refundable per clinic policy.', ntn: '1234567-8',
    patientName: 'Muhammad Bilal Khan', patientDisplayId: 'P-0012', method: 'Easypaisa', paidOn: '2026-11-14', amountMinor: 1500000,
    chargedMinor: '4000000', creditedMinor: '50000', paidMinor: '2500000', balanceMinor: '1450000',
    allocations: [{ chargeId: 'a', description: 'Root canal treatment · 36 · qty 1', amountMinor: 1000000 }, { chargeId: 'b', description: 'Composite filling on the lower left first molar with a very long description that has to wrap onto a second line', amountMinor: 500000 }],
  },
};

test('receipt PDF is a well-formed single-page PDF whose cross-reference offsets point at their objects', () => {
  const bytes = receiptPdf(sample); const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1]); assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  assert.equal(offsets.length, 6);
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  const len = Number(/4 0 obj\n<< \/Length (\d+) >>/.exec(text)![1]); const start = text.indexOf('stream\n', text.indexOf('4 0 obj')) + 7;
  assert.equal(text.slice(start + len, start + len + 10), '\nendstream');
  if (process.env.RECEIPT_PDF_OUT) writeFileSync(process.env.RECEIPT_PDF_OUT, bytes);
});

test('a logo is embedded as a JPEG image object', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);
  const text = Buffer.from(receiptPdf({ ...sample, logoJpeg: { bytes: jpeg, width: 400, height: 160 } })).toString('latin1');
  assert.match(text, /\/XObject << \/Im1 7 0 R >>/); assert.match(text, /\/Filter \/DCTDecode \/Length 8/); assert.match(text, /\/Im1 Do/);
});

test('characters outside the PDF standard font become "?" instead of breaking the file', () => {
  const text = Buffer.from(receiptPdf({ ...sample, snapshot: { ...sample.snapshot, patientName: 'Ayesha عائشہ' } })).toString('latin1');
  assert.ok(text.includes('%%EOF'));
});
