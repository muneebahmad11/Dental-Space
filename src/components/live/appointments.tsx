'use client';
import { Calendar } from './calendar';
import { useClinic } from './session';
export function AppointmentCalendar({start='',patientId=''}:{start?:''|'book'|'walk_in';patientId?:string}){const {can}=useClinic();return <div className="staff-workspace live-inner wide"><div className="page-heading"><div><p className="eyebrow">Branch calendar</p><h1>Appointments</h1></div></div>{can('appointment.read')&&can('patient.demographics.read')?<Calendar start={can('appointment.write')?start:''} patientId={patientId}/>:<section><h2>Appointment access required</h2><p>Your account needs appointment read/write access before you can use this calendar. Existing patient records are available from Patients.</p></section>}</div>;}
