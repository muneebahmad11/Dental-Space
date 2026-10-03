'use client';

import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Wallet, Receipt, LockKeyhole, LayoutDashboard, Plus, Search, ShieldCheck, Stethoscope, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Appointment, Patient, demoDate, dentists, initialAppointments, initialPatients, procedures, VisitDraft, emptyVisit, initialVisits } from '@/lib/demo/data';

import { emptyLedger, postCharges, recordPayment, type Ledger, type ChargeSource, type Payment, type PaymentMethod } from '@/lib/demo/billing';

import { emptyOperations, addExpense, closeDay, requireOpenDay, type Operations, type Expense } from '@/lib/demo/operations';

type DemoState = { operations: Operations; recordExpense: (expense: Expense) => void; finishDay: (input: { date: string; opening: number; counted: number; note: string }) => void; ledger: Ledger; chargeTreatments: (patientId: string, sources: ChargeSource[]) => void; payAccount: (input: { id: string; patientId: string; amount: number; method: PaymentMethod }) => Payment; visits: Record<string, VisitDraft>; updateVisit: (id: string, changes: Partial<VisitDraft>) => void; finishVisit: (id: string) => boolean; patients: Patient[]; appointments: Appointment[]; addPatient: (p: Patient) => void; addAppointment: (a: Appointment) => void; changeStatus: (id: string, status: Appointment['status']) => void; openPatient: () => void; openBooking: (id?: string, date?: string) => void };
const DemoContext = createContext<DemoState | null>(null);
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('Demo provider missing'); return context; }
const nav = [{ href: '/', name: 'Overview', icon: LayoutDashboard }, { href: '/appointments', name: 'Appointments', icon: CalendarDays }, { href: '/patients', name: 'Patients', icon: Users }, { href: '/billing', name: 'Billing', icon: Wallet }, { href: '/expenses', name: 'Expenses', icon: Receipt }, { href: '/closing', name: 'Daily closing', icon: LockKeyhole }];
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const initials = (name: string) => name.split(' ').map(n => n[0]).slice(0, 2).join('');

export function Workspace({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [operations, setOperations] = useState<Operations>(emptyOperations);
  const operationsRef = useRef(operations);
  const [ledger, setLedger] = useState<Ledger>(emptyLedger);
  const ledgerRef = useRef(ledger);
  const [visits, setVisits] = useState<Record<string, VisitDraft>>(initialVisits);
  const [patients, setPatients] = useState(initialPatients);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [modal, setModal] = useState<'patient' | 'booking' | null>(null);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [bookingDate, setBookingDate] = useState(demoDate);
  const [notice, setNotice] = useState('');
  const value: DemoState = {
    patients, appointments, visits, ledger, operations,
    recordExpense: expense => {
      const next = addExpense(operationsRef.current, expense);
      operationsRef.current = next; setOperations(next);
    },
    finishDay: input => {
      const next = closeDay(operationsRef.current, ledgerRef.current, input);
      operationsRef.current = next; setOperations(next);
    },
    chargeTreatments: (patientId, sources) => {
      requireOpenDay(operationsRef.current, demoDate);
      if (!patients.some(p => p.id === patientId)) throw new Error('Patient not found.');
      for (const source of sources) {
        const appointment = appointments.find(a => a.id === source.visitId);
        const visit = visits[source.visitId];
        const item = visit?.items.find(i => i.id === source.itemId);
        if (appointment?.patientId !== patientId || !visit?.completed || !item || item.status === 'Proposed') throw new Error('Only accepted or completed items from a completed demo visit can be charged.');
      }
      const next = postCharges(ledgerRef.current, patientId, demoDate, sources);
      ledgerRef.current = next; setLedger(next);
    },
    payAccount: input => {
      requireOpenDay(operationsRef.current, demoDate);
      const patient = patients.find(p => p.id === input.patientId);
      if (!patient) throw new Error('Patient not found.');
      const result = recordPayment(ledgerRef.current, { ...input, patientName: patient.name, date: demoDate });
      ledgerRef.current = result.ledger; setLedger(result.ledger);
      return result.payment;
    },
    updateVisit: (id, changes) => setVisits(current => current[id]?.completed ? current : { ...current, [id]: { ...(current[id] ?? emptyVisit), ...changes } }),
    finishVisit: id => {
      const draft = visits[id];
      if (!draft || !draft.complaint.trim() || !draft.findings.trim() || !draft.alertsReviewed || appointments.find(a => a.id === id)?.status !== 'Arrived') return false;
      setVisits(current => ({ ...current, [id]: { ...current[id], completed: true } }));
      setAppointments(list => list.map(a => a.id === id ? { ...a, status: 'Completed' } : a));
      setNotice('Demo visit completed. Its note is read-only for this session.');
      return true;
    },
    addPatient: patient => { setPatients(p => [...p, patient]); setNotice(`${patient.name} added to the demo patient list.`); setModal(null); },
    addAppointment: appointment => { setAppointments(a => [...a, appointment]); setNotice(`Demo appointment booked for ${appointment.date} at ${appointment.time}.`); setModal(null); },
    changeStatus: (id, status) => { setAppointments(list => list.map(a => a.id === id ? { ...a, status } : a)); setNotice(`Appointment marked ${status.toLowerCase()}.`); },
    openPatient: () => setModal('patient'),
    openBooking: (id = '', date = demoDate) => { setSelectedPatient(id); setBookingDate(date); setModal('booking'); },
  };
  return <DemoContext.Provider value={value}>
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/" className="brand"><span className="brand-icon"><Stethoscope size={23} /></span><span>Dental<span className="brand-light">space</span><small>CLINIC WORKSPACE</small></span></Link>
        <div className="clinic-label"><span className="clinic-avatar">D</span><div>Demo Dental Clinic<small>Single branch · Preview</small></div></div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">{nav.map(({ href, name, icon: Icon }) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={`nav-link ${path === href || (href === '/appointments' && path.startsWith('/visits/')) || (href === '/billing' && (path.startsWith('/accounts/') || path.startsWith('/receipts/'))) ? 'active' : ''}`}><Icon size={19} />{name}{path === href && <span className="nav-dot" />}</Link>)}</nav>
        <div className="sidebar-note"><ShieldCheck size={22} /><strong>A space to explore</strong><p>Try the reception workflow with fictional patients.</p><span>Demo mode</span></div>
        <div className="profile"><span className="avatar">RC</span><div>Reception<small>Demo workspace</small></div><span className="online-dot" /></div>
      </aside>
      <div className="workspace-main">
        <header className="topbar"><span>Workspace <span className="breadcrumb">/</span> <strong>{path.startsWith('/visits/') ? 'Patient visit' : path.startsWith('/accounts/') ? 'Patient account' : path.startsWith('/receipts/') ? 'Receipt' : nav.find(n => n.href === path)?.name ?? 'Page'}</strong></span><span className="demo-pill"><span className="online-dot" />Demo data</span></header>
        <div className="demo-banner"><ShieldCheck size={16} /><span>Interactive demo · Use fictional details only. Changes reset when you refresh.</span></div>
        <main className="page-content">{notice && <div className="notice" role="status"><Check size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}{children}</main>
      </div>
    </div>
    {modal && <Modal title={modal === 'patient' ? 'Register a patient' : 'Book an appointment'} close={() => setModal(null)}>{modal === 'patient' ? <PatientForm /> : <BookingForm patientId={selectedPatient} date={bookingDate} />}</Modal>}
  </DemoContext.Provider>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return <dialog ref={node => { dialogRef.current = node; if (node && !node.open) node.showModal(); }} onCancel={close} aria-labelledby="modal-title" className="demo-dialog">
    <div className="modal-heading"><div><p className="eyebrow">DEMO WORKSPACE</p><h2 id="modal-title">{title}</h2></div><button onClick={close} aria-label="Close dialog" className="icon-button"><X size={20} /></button></div>
    <p className="modal-description">Fictional details only. Saved for this preview session.</p>{children}
  </dialog>;
}

function PatientForm() {
  const { patients, addPatient } = useDemo();
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim(); const phone = String(data.get('phone')).trim();
    if (name.length < 2 || phone.replace(/\D/g, '').length < 7) { setError('Enter a name and a phone number with at least 7 digits.'); return; }
    addPatient({ id: `P-${1001 + patients.length}`, name, phone, email: String(data.get('email')).trim(), alert: String(data.get('alert')).trim() });
  }
  return <form onSubmit={submit} className="demo-form"><label>Full name<input name="name" required maxLength={80} placeholder="e.g. Alex Taylor" autoComplete="off" /></label><div className="form-grid"><label>Phone number<input name="phone" type="tel" required maxLength={30} placeholder="0300-0000000" autoComplete="off" /></label><label>Email <span>(optional)</span><input name="email" type="email" maxLength={100} placeholder="alex@example.test" autoComplete="off" /></label></div><label>Medical alert <span>(optional, fictional)</span><input name="alert" maxLength={160} placeholder="e.g. Latex allergy" /></label><p className="form-hint">Shared family phone numbers are allowed. Each patient gets a unique patient ID.</p>{error && <p role="alert" className="form-error">{error}</p>}<Button type="submit" className="w-full"><Plus size={16} />Register demo patient</Button></form>;
}

function BookingForm({ patientId, date }: { patientId: string; date: string }) {
  const { patients, appointments, addAppointment } = useDemo();
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const booking: Appointment = { id: crypto.randomUUID(), patientId: String(data.get('patient')), date: String(data.get('date')), time: String(data.get('time')), dentist: String(data.get('dentist')), procedure: String(data.get('procedure')), status: 'Scheduled' };
    if (appointments.some(a => a.date === booking.date && a.time === booking.time && a.status !== 'Cancelled' && (a.dentist === booking.dentist || a.patientId === booking.patientId))) { setError('This dentist or patient already has an appointment in that slot. Choose another time or dentist.'); return; }
    addAppointment(booking);
  }
  return <form onSubmit={submit} className="demo-form"><label>Patient<select name="patient" defaultValue={patientId} required><option value="" disabled>Select a patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label><div className="form-grid"><label>Date<input name="date" type="date" defaultValue={date} required /></label><label>Time<select name="time" defaultValue="10:30">{Array.from({ length: 18 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`).map(t => <option key={t}>{t}</option>)}</select></label></div><label>Dentist<select name="dentist">{dentists.map(d => <option key={d}>{d}</option>)}</select></label><label>Procedure<select name="procedure">{procedures.map(p => <option key={p}>{p}</option>)}</select></label><p className="form-hint">Demo appointments use 30-minute slots, 09:00–18:00.</p>{error && <p role="alert" className="form-error">{error}</p>}<Button type="submit" className="w-full"><CalendarDays size={16} />Book demo appointment</Button></form>;
}

function PageHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{subtitle}</p><h1>{title}</h1></div><div className="heading-actions">{children}</div></div>; }
function Status({ value }: { value: Appointment['status'] }) { return <span className={`status status-${value.toLowerCase()}`}><span />{value}</span>; }

function AppointmentRows({ appointments }: { appointments: Appointment[] }) {
  const { patients, changeStatus } = useDemo();
  if (!appointments.length) return <div className="empty-state"><CalendarDays size={30} /><h3>A little room in the schedule</h3><p>No appointments match this view. Book an appointment to get started.</p></div>;
  return <div className="table-scroll"><table><thead><tr><th>Time</th><th>Patient</th><th>Appointment</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{appointments.map(a => { const patient = patients.find(p => p.id === a.patientId)!; return <tr key={a.id}><td><strong>{a.time}</strong><small>30 min</small></td><td><div className="patient-cell"><span className="avatar">{initials(patient.name)}</span><div><strong>{patient.name}</strong><small>{patient.id}{patient.alert && <span className="alert-text"> · Medical alert</span>}</small></div></div></td><td><strong>{a.procedure}</strong><small>{a.dentist}</small></td><td><Status value={a.status} /></td><td>{a.status === 'Scheduled' ? <div className="row-actions"><button className="text-button" onClick={() => changeStatus(a.id, 'Arrived')} aria-label={`Check in ${patient.name}`}>Check in</button><button className="cancel-button" aria-label={`Cancel appointment for ${patient.name}`} onClick={() => changeStatus(a.id, 'Cancelled')}><X size={15} /></button></div> : a.status === 'Arrived' ? <Link className="text-button" href={`/visits/${a.id}`} aria-label={`Open visit for ${patient.name}`}>Open visit <ArrowRight size={13} /></Link> : a.status === 'Completed' ? <Link className="text-button" href={`/visits/${a.id}`} aria-label={`View visit for ${patient.name}`}>View visit</Link> : <span className="muted">—</span>}</td></tr>; })}</tbody></table></div>;
}

export function Dashboard() {
  const { appointments, patients, openPatient, openBooking } = useDemo();
  const today = appointments.filter(a => a.date === demoDate).sort((a, b) => a.time.localeCompare(b.time));
  const stats = [{ name: "Today's appointments", value: today.filter(a => a.status !== 'Cancelled').length, detail: 'Across 2 dentists', icon: CalendarDays }, { name: 'Waiting for care', value: today.filter(a => a.status === 'Arrived').length, detail: 'Checked in and ready', icon: Clock3 }, { name: 'Completed visits', value: today.filter(a => a.status === 'Completed').length, detail: "Today's completed appointments", icon: Check }, { name: 'Registered patients', value: patients.length, detail: 'In this demo workspace', icon: Users }];
  return <><PageHeading title="A clear view of your day." subtitle={dateLabel(demoDate)}><Button variant="outline" onClick={openPatient}><Plus size={16} />Add patient</Button><Button onClick={() => openBooking()}><Plus size={16} />Book appointment</Button></PageHeading><section className="welcome-card"><div><span className="welcome-tag"><Activity size={14} />THE DAY, AT A GLANCE</span><h2>Good care starts with a well-organized day.</h2><p>Your appointments, patients and next steps. All in one place.</p></div><div className="welcome-art" aria-hidden="true"><div className="art-ring"><Stethoscope size={60} strokeWidth={1.2} /></div><span className="art-plus">+</span></div></section><section className="stats-grid" aria-label="Clinic overview">{stats.map(({ name, value, detail, icon: Icon }) => <article key={name} className="stat-card"><div className="stat-label">{name}<Icon size={18} /></div><strong>{value.toString().padStart(2, '0')}</strong><p>{detail}</p></article>)}</section><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Today’s appointments</h2><p>Tuesday, 29 September · Demo schedule</p></div><Link className="text-button" href="/appointments">View calendar <ArrowRight size={15} /></Link></div><AppointmentRows appointments={today} /></section><aside className="panel day-sidebar"><div className="panel-heading"><div><h2>Care team</h2><p>Today’s demo roster</p></div></div>{dentists.map((d, i) => <div key={d} className="dentist-row"><span className={`avatar dentist-${i}`}>{initials(d.replace('Dr. ', ''))}</span><div><strong>{d}</strong><small>{i ? 'General dentistry' : 'Restorative dentistry'}</small></div><span className="online-dot" /></div>)}<div className="reception-note"><span className="eyebrow">RECEPTION CHECKLIST</span><h3>Ready for the next patient?</h3><p>Review patient alerts, confirm the appointment, then mark their arrival.</p><Link href="/patients" className="text-button">Open patient directory <ArrowRight size={15} /></Link></div></aside></div></>;
}

export function Patients() {
  const { patients, appointments, openPatient, openBooking } = useDemo();
  const [search, setSearch] = useState(''); const [selected, setSelected] = useState<Patient | null>(null);
  const filtered = patients.filter(p => `${p.name} ${p.phone} ${p.id}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <><PageHeading title="Patients" subtitle="PEOPLE AT THE HEART OF YOUR PRACTICE"><Button onClick={openPatient}><Plus size={16} />Add patient</Button></PageHeading><section className="panel"><div className="directory-toolbar"><div><h2>Patient directory <span className="count-badge">{patients.length}</span></h2><p>Fictional records for exploring the reception workflow.</p></div><label className="search-field"><Search size={18} /><input aria-label="Search patients" placeholder="Search name, phone or patient ID" value={search} onChange={e => setSearch(e.target.value)} /></label></div>{filtered.length ? <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Phone</th><th>Medical alert</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td><button className="patient-cell patient-link" onClick={() => setSelected(p)}><span className="avatar">{initials(p.name)}</span><span><strong>{p.name}</strong><small>{p.id}</small></span></button></td><td>{p.phone}</td><td>{p.alert ? <span className="medical-alert">{p.alert}</span> : <span className="muted">None recorded</span>}</td><td><div className="row-actions"><Link className="text-button" href={`/accounts/${p.id}`} aria-label={`Account for ${p.name}`}>Account</Link><button className="text-button" onClick={() => openBooking(p.id)} aria-label={`Book appointment for ${p.name}`}>Book visit <ArrowRight size={14} /></button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><Search size={28} /><h3>No patients found</h3><p>Try a different name, phone number or patient ID.</p><Button variant="outline" onClick={() => setSearch('')}>Clear search</Button></div>}<div className="table-footer">Showing {filtered.length} of {patients.length} demo patients</div></section>{selected && <Modal title={selected.name} close={() => setSelected(null)}><dl className="patient-details"><dt>Patient ID</dt><dd>{selected.id}</dd><dt>Phone</dt><dd>{selected.phone}</dd><dt>Email</dt><dd>{selected.email || 'Not provided'}</dd><dt>Medical alert</dt><dd>{selected.alert || 'None recorded'}</dd><dt>Appointments</dt><dd>{appointments.filter(a => a.patientId === selected.id).length} in this demo</dd></dl><Button className="w-full" onClick={() => { openBooking(selected.id); setSelected(null); }}>Book appointment</Button></Modal>}</>;
}

export function Appointments() {
  const { appointments, openBooking } = useDemo();
  const [date, setDate] = useState(demoDate); const [dentist, setDentist] = useState(''); const [status, setStatus] = useState('');
  const filtered = appointments.filter(a => a.date === date && (!dentist || a.dentist === dentist) && (!status || a.status === status)).sort((a, b) => a.time.localeCompare(b.time));
  const moveDay = (offset: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + offset); setDate(next.toISOString().slice(0, 10)); };
  return <><PageHeading title="Appointments" subtitle="MAKE SPACE FOR BETTER CARE"><Button onClick={() => openBooking('', date)}><Plus size={16} />Book appointment</Button></PageHeading><section className="panel"><div className="calendar-toolbar"><div className="date-controls"><button className="icon-button" aria-label="Previous day" onClick={() => moveDay(-1)}><ChevronLeft size={18} /></button><label><span className="sr-only">Schedule date</span><input type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label><button className="icon-button" aria-label="Next day" onClick={() => moveDay(1)}><ChevronRight size={18} /></button><button className="text-button" onClick={() => setDate(demoDate)}>Demo day</button></div><div className="calendar-filters"><select aria-label="Filter by dentist" value={dentist} onChange={e => setDentist(e.target.value)}><option value="">All dentists</option>{dentists.map(d => <option key={d}>{d}</option>)}</select><select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['Scheduled', 'Arrived', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}</select></div></div><div className="calendar-date"><h2>{dateLabel(date)}</h2><span>{filtered.length} appointments · Day view</span></div><AppointmentRows appointments={filtered} /></section><p className="page-footnote">Demo scheduling checks dentist and patient slot conflicts. Availability rules and server validation will follow with the backend.</p></>;
}
