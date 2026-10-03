'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, CreditCard, Plus, Printer, Receipt, Search, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { accountTotals, demoRates, money, parseAmount, paymentMethods, type ChargeSource, type PaymentMethod } from '@/lib/demo/billing';
import { useDemo } from './workspace';
import { demoDate } from '@/lib/demo/data';

function DemoCurrencyNote() {
  return <p className="billing-disclaimer">Demo currency: PKR · Illustrative prices only, not an approved clinic fee list. No real money is collected.</p>;
}
function AccountSummary({ charged, paid, balance }: { charged: number; paid: number; balance: number }) {
  return <section className="account-stats" aria-label="Account totals">
    {[{ label: 'Total charges', value: charged, icon: Receipt }, { label: 'Payments recorded', value: paid, icon: CreditCard }, { label: 'Outstanding balance', value: balance, icon: Wallet }].map(({ label, value, icon: Icon }) => <article className="stat-card" key={label}><div className="stat-label">{label}<Icon size={18} /></div><strong>{money(value)}</strong></article>)}
  </section>;
}

export function BillingOverview() {
  const { patients, ledger } = useDemo();
  const [search, setSearch] = useState('');
  const totals = patients.map(p => accountTotals(ledger, p.id)).reduce((a, b) => ({ charged: a.charged + b.charged, paid: a.paid + b.paid, balance: a.balance + b.balance }), { charged: 0, paid: 0, balance: 0 });
  const filtered = patients.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <><div className="page-heading"><div><p className="eyebrow">FROM CARE TO COLLECTION</p><h1>Billing & accounts</h1></div><span className="demo-pill">Demo ledger</span></div><DemoCurrencyNote /><AccountSummary {...totals} />
    <section className="panel"><div className="directory-toolbar"><div><h2>Patient accounts</h2><p>Review treatment charges, record payments and view receipts.</p></div><label className="search-field"><Search size={18} /><input aria-label="Search accounts" placeholder="Search patient name or ID" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Charged</th><th>Paid</th><th>Balance</th><th><span className="sr-only">Account</span></th></tr></thead><tbody>{filtered.map(p => { const total = accountTotals(ledger, p.id); return <tr key={p.id}><td><strong>{p.name}</strong><small>{p.id}</small></td><td>{money(total.charged)}</td><td>{money(total.paid)}</td><td><span className={total.balance ? 'balance-due' : 'muted'}>{money(total.balance)}</span></td><td><Link className="text-button" href={`/accounts/${p.id}`} aria-label={`Open account for ${p.name}`}>Open account <ArrowRight size={14} /></Link></td></tr>; })}</tbody></table></div> : <div className="empty-state"><Search size={26} /><h3>No accounts found</h3><p>Try another patient name or ID.</p></div>}
    </section><p className="page-footnote">Start with Amina Shah’s completed demo visit to try creating a charge, or finish a new visit with an accepted treatment item.</p>
  </>;
}

function ChargeRow({ source, patientId }: { source: ChargeSource; patientId: string }) {
  const { chargeTreatments, operations } = useDemo();
  const closed = operations.closings.some(c => c.date === demoDate);
  const [amount, setAmount] = useState((source.amount / 100).toFixed(2));
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const parsed = parseAmount(amount);
    if (parsed === null) { setError('Enter a positive amount, up to 999,999.99, with at most two decimal places.'); return; }
    try { chargeTreatments(patientId, [{ ...source, amount: parsed }]); } catch (e) { setError(e instanceof Error ? e.message : 'Could not post charge.'); }
  }
  return <form className="pending-charge" onSubmit={submit}><div><strong>{source.description}</strong><small>Completed visit · <Link href={`/visits/${source.visitId}`}>View note</Link></small></div><label><span className="sr-only">Charge amount for {source.description}</span><span className="currency-input"><span>PKR</span><input aria-label={`Charge amount for ${source.description}`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required maxLength={9} disabled={closed} /></span></label><Button variant="outline" type="submit" disabled={closed} aria-label={`Post charge for ${source.description}`}><Plus size={14} />Post charge</Button>{error && <p className="form-error charge-error" role="alert">{error}</p>}</form>;
}

export function PatientAccount({ patientId }: { patientId: string }) {
  const { patients, appointments, visits, ledger, payAccount, operations } = useDemo();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [error, setError] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const requestId = useRef<string | null>(null);
  const patient = patients.find(p => p.id === patientId);
  if (!patient) return <section className="panel empty-state"><Wallet size={28} /><h1>Account unavailable</h1><p>This demo patient may have been cleared by a refresh.</p><Button asChild><Link href="/billing">Back to accounts</Link></Button></section>;
  const closed = operations.closings.some(c => c.date === demoDate);
  const totals = accountTotals(ledger, patientId);
  const charges = ledger.charges.filter(c => c.patientId === patientId);
  const payments = ledger.payments.filter(p => p.patientId === patientId);
  const pending = appointments.filter(a => a.patientId === patientId).flatMap(a => {
    const visit = visits[a.id];
    if (!visit?.completed) return [];
    return visit.items.filter(item => item.status !== 'Proposed' && !ledger.charges.some(c => c.visitId === a.id && c.itemId === item.id)).map(item => ({ visitId: a.id, itemId: item.id, description: `${item.procedure}${item.tooth ? ` · Tooth ${item.tooth}` : ''}`, amount: demoRates[item.procedure] ?? 100000 }));
  });
  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const parsed = parseAmount(amount);
    if (parsed === null) { setError('Enter a positive amount with at most two decimal places.'); return; }
    try {
      requestId.current ??= crypto.randomUUID();
      const payment = payAccount({ id: requestId.current, patientId, amount: parsed, method });
      setReceiptId(payment.id); setAmount(''); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record payment.'); }
  }
  return <><Link href="/billing" className="text-button back-link"><ArrowLeft size={15} />All patient accounts</Link><div className="page-heading"><div><p className="eyebrow">PATIENT ACCOUNT · {patient.id}</p><h1>{patient.name}</h1></div><span className="demo-pill">{totals.balance ? 'Balance outstanding' : totals.charged ? 'Paid in full' : 'No posted charges'}</span></div><DemoCurrencyNote />{closed && <div className="notice"><span>This demo day is closed. Charges and payments are locked.</span><Link href="/closing" className="text-button">View closing</Link></div>}<AccountSummary {...totals} />
    <div className="billing-grid"><div className="billing-panels"><section className="panel"><div className="panel-heading"><div><h2>Ready to charge</h2><p>Accepted or completed items from completed visits. Post each item once.</p></div><span className="count-badge">{pending.length}</span></div>{pending.length ? <div className="pending-charges">{pending.map(source => <ChargeRow key={`${source.visitId}:${source.itemId}`} source={source} patientId={patientId} />)}</div> : <div className="billing-empty"><Check size={20} /><p>No unbilled eligible treatments. Complete a visit with accepted items to add charges.</p><Link className="text-button" href="/appointments">Open appointments <ArrowRight size={14} /></Link></div>}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Posted charges</h2><p>Prices are fixed when posted to this demo account.</p></div></div>{charges.length ? <div className="table-scroll"><table><thead><tr><th>Item</th><th>Amount</th><th>Remaining</th></tr></thead><tbody>{charges.map(c => { const paid = payments.flatMap(p => p.allocations).filter(a => a.chargeId === c.id).reduce((sum, a) => sum + a.amount, 0); return <tr key={c.id}><td><strong>{c.description}</strong><small>{c.date}</small></td><td>{money(c.amount)}</td><td>{money(c.amount - paid)}</td></tr>; })}</tbody></table></div> : <p className="billing-empty">No charges posted yet.</p>}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Payment history</h2><p>Receipt totals reflect the account when each payment was recorded.</p></div></div>{payments.length ? <div className="table-scroll"><table><thead><tr><th>Receipt</th><th>Method</th><th>Amount</th><th><span className="sr-only">View</span></th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td><strong>{p.receiptNumber}</strong><small>{p.date}</small></td><td>{p.method}</td><td>{money(p.amount)}</td><td><Link className="text-button" href={`/receipts/${p.id}`} aria-label={`View receipt ${p.receiptNumber}`}>View receipt <ArrowRight size={13} /></Link></td></tr>)}</tbody></table></div> : <p className="billing-empty">No payments recorded.</p>}</section></div>
      <aside className="panel payment-panel"><div className="panel-heading"><div><h2>Record a payment</h2><p>Demo entry · no payment is collected</p></div><CreditCard size={20} /></div><form className="demo-form payment-form" onSubmit={submitPayment}><label>Amount (PKR)<input inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); requestId.current = null; }} placeholder="0.00" required maxLength={9} disabled={closed || !totals.balance} /></label><button type="button" className="text-button" disabled={closed || !totals.balance} onClick={() => { setAmount((totals.balance / 100).toFixed(2)); requestId.current = null; }}>Use full balance · {money(totals.balance)}</button><label>Payment method<select value={method} onChange={e => { setMethod(e.target.value as PaymentMethod); requestId.current = null; }} disabled={closed || !totals.balance}>{paymentMethods.map(m => <option key={m}>{m}</option>)}</select></label><p className="form-hint">Partial payments are supported. Payments cover the oldest outstanding charges first. Deposits and overpayments are not enabled.</p>{error && <p role="alert" className="form-error">{error}</p>}<Button type="submit" disabled={closed || !totals.balance || !amount}><Plus size={16} />Record demo payment</Button>{!totals.balance && <p className="form-hint">{totals.charged ? 'This account is paid in full.' : 'Post a charge before recording a payment.'}</p>}{receiptId && <div className="payment-success" role="status"><Check size={17} /><div>Demo payment recorded.<Link href={`/receipts/${receiptId}`} className="text-button">View latest receipt <ArrowRight size={14} /></Link></div></div>}</form></aside>
    </div><p className="page-footnote">All charges and receipts reset on refresh. Refunds, credits, permissions and durable financial records are deferred.</p>
  </>;
}

export function ReceiptView({ receiptId }: { receiptId: string }) {
  const { ledger } = useDemo();
  const payment = ledger.payments.find(p => p.id === receiptId);
  if (!payment) return <section className="panel empty-state"><Receipt size={30} /><h1>Receipt unavailable</h1><p>Demo receipts exist only in the current session and reset on refresh.</p><Button asChild><Link href="/billing">Back to billing</Link></Button></section>;
  return <div className="receipt-page"><div className="receipt-actions"><Link className="text-button" href={`/accounts/${payment.patientId}`}><ArrowLeft size={15} />Back to patient account</Link><Button onClick={() => window.print()}><Printer size={16} />Print / Save PDF</Button></div><article className="receipt-paper"><div className="receipt-top"><div><p className="eyebrow">DENTALSPACE · DEMO DENTAL CLINIC</p><h1>Payment receipt</h1></div><Receipt size={36} strokeWidth={1.3} /></div><p className="receipt-watermark">DEMO — NOT A REAL PAYMENT OR TAX RECEIPT</p><dl className="receipt-meta"><div><dt>Receipt number</dt><dd>{payment.receiptNumber}</dd></div><div><dt>Demo transaction date</dt><dd>{payment.date}</dd></div><div><dt>Patient</dt><dd>{payment.patientName}<small>{payment.patientId}</small></dd></div><div><dt>Payment method</dt><dd>{payment.method}</dd></div></dl><h2>Payment applied to</h2><table><thead><tr><th>Treatment charge</th><th>Applied amount</th></tr></thead><tbody>{payment.allocations.map(a => <tr key={a.chargeId}><td>{a.description}</td><td>{money(a.amount)}</td></tr>)}</tbody></table><div className="receipt-paid"><span>This payment</span><strong>{money(payment.amount)}</strong></div><dl className="receipt-totals"><div><dt>Total charges at payment</dt><dd>{money(payment.chargedAtPayment)}</dd></div><div><dt>Total paid after this payment</dt><dd>{money(payment.paidAtPayment)}</dd></div><div><dt>Remaining balance at payment</dt><dd>{money(payment.balanceAfter)}</dd></div></dl><footer>Fictional data and illustrative PKR prices. No real money was collected.<br />This snapshot does not change when later payments are recorded.</footer></article></div>;
}
