'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { businessDate, moneyMinor } from '@/lib/finance/contracts';
import { reportRange, type FinanceReport } from '@/lib/reports/contracts';
import { api, scopeHeaders, useClinic } from './session';

export function FinancialReports() {
  const {scope,can} = useClinic();
  const [from,setFrom] = useState(()=>`${businessDate(scope.timezone).slice(0,7)}-01`);
  const [to,setTo] = useState(()=>businessDate(scope.timezone));
  const [request,setRequest] = useState({from,to,revision:0});
  const [report,setReport] = useState<FinanceReport|null>(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const allowed = can('billing.read') && can('expense.read');
  useEffect(()=>{
    if (!allowed) return;
    const controller = new AbortController();
    api(`/api/v1/reports/finance?${new URLSearchParams({from:request.from,to:request.to})}`,{headers:scopeHeaders(scope),signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted){setReport(data);setError('');}})
      .catch(e=>{if(!controller.signal.aborted){setReport(null);setError(e.message);}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[allowed,scope,request]);
  function run(event:FormEvent){
    event.preventDefault();
    if (!reportRange.safeParse({from,to}).success){setError('Choose an ordered date range of up to 366 days.');return;}
    setError('');setReport(null);setLoading(true);
    setRequest(previous=>({from,to,revision:previous.revision+1}));
  }
  if(!allowed)return <section className="staff-workspace live-inner"><h1>Financial reports</h1><p>Your account needs billing and expense read access.</p></section>;
  return <div className="staff-workspace live-inner financial-reports"><h1>Financial reports</h1><p>Recorded payments, refunds and paid expenses for {scope.branchName}, grouped by business date. These totals show money movement; they are not a profit statement or bank reconciliation.</p>
    <section><form onSubmit={run}><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)} required/></label><button disabled={loading}>{loading?'Loading…':'Run report'}</button></form></section>
    {error&&<p className="staff-error" role="alert">{error}</p>}
    {report&&<><section><h2>{report.from} to {report.to}</h2><p>Payments: {moneyMinor(report.totals.receiptsMinor)}</p><p>Refunds: {moneyMinor(report.totals.refundsMinor)}</p><p>Payments after refunds: {moneyMinor(report.totals.netReceiptsMinor)}</p><p>Paid expenses: {moneyMinor(report.totals.expensesMinor)}</p><p>Net money movement: {moneyMinor(report.totals.netMovementMinor)}</p><small>Generated {new Date(report.generatedAt).toLocaleString()}</small></section>
      <section><h2>By payment method</h2><table><thead><tr><th>Method</th><th>Payments</th><th>Refunds</th><th>Expenses</th><th>Net movement</th></tr></thead><tbody>{report.methods.map(row=><tr key={row.method}><th scope="row">{row.method}</th><td>{moneyMinor(row.receiptsMinor)}</td><td>{moneyMinor(row.refundsMinor)}</td><td>{moneyMinor(row.expensesMinor)}</td><td>{moneyMinor(row.netMovementMinor)}</td></tr>)}</tbody></table></section>
      <section><h2>Daily totals</h2>{report.days.length?<table><thead><tr><th>Date</th><th>Payments</th><th>Refunds</th><th>Expenses</th><th>Net movement</th></tr></thead><tbody>{report.days.map(row=><tr key={row.businessDate}><th scope="row">{row.businessDate}</th><td>{moneyMinor(row.receiptsMinor)}</td><td>{moneyMinor(row.refundsMinor)}</td><td>{moneyMinor(row.expensesMinor)}</td><td>{moneyMinor(row.netMovementMinor)}</td></tr>)}</tbody></table>:<p>No transactions in this range.</p>}</section></>}
    {!report&&!error&&<p role="status">Loading report…</p>}
  </div>;
}
