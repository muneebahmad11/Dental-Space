'use client';
import { StaffAppointments } from '@/components/staff/appointments';
import { useClinic } from './session';
export function AppointmentCalendar(){const {scope,can}=useClinic();return <div className="staff-workspace live-inner"><div className="page-heading"><div><p className="eyebrow">Branch calendar</p><h1>Appointments</h1></div></div>{can('appointment.read')&&can('patient.demographics.read')?<StaffAppointments scope={scope} canWrite={can('appointment.write')}/>:<section><h2>Appointment access required</h2><p>Your account needs appointment read/write access before you can use this calendar. Existing patient records are available from Patients.</p></section>}</div>;}
