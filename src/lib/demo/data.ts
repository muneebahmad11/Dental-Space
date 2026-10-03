export type Patient = { id: string; name: string; phone: string; email: string; alert: string };
export type Appointment = { id: string; patientId: string; date: string; time: string; dentist: string; procedure: string; status: 'Scheduled' | 'Arrived' | 'Completed' | 'Cancelled' };
export const demoDate = '2026-09-29';
export const dentists = ['Dr. Sara Khan', 'Dr. Omar Ali'];
export const procedures = ['Consultation', 'Cleaning', 'Filling', 'Root canal review', 'Orthodontic review'];
export const initialPatients: Patient[] = [
  { id: 'P-1001', name: 'Amina Shah', phone: '0300-0000101', email: 'amina@example.test', alert: 'Penicillin allergy' },
  { id: 'P-1002', name: 'Hamza Malik', phone: '0300-0000102', email: 'hamza@example.test', alert: '' },
  { id: 'P-1003', name: 'Noor Ahmed', phone: '0300-0000103', email: 'noor@example.test', alert: 'Latex allergy' },
  { id: 'P-1004', name: 'Bilal Hassan', phone: '0300-0000104', email: 'bilal@example.test', alert: '' },
  { id: 'P-1005', name: 'Zoya Mir', phone: '0300-0000105', email: 'zoya@example.test', alert: '' },
  { id: 'P-1006', name: 'Daniyal Raza', phone: '0300-0000106', email: 'daniyal@example.test', alert: '' },
];
export const initialAppointments: Appointment[] = initialPatients.map((p, i) => ({ id: `A-${i + 1}`, patientId: p.id, date: demoDate, time: ['09:00', '09:30', '10:00', '11:00', '12:00', '14:30'][i], dentist: dentists[i % 2], procedure: procedures[i % 5], status: i === 0 ? 'Completed' : i < 3 ? 'Arrived' : 'Scheduled' }));

export type TreatmentItem = { id: string; procedure: string; tooth: string; status: 'Proposed' | 'Accepted' | 'Completed' };
export type VisitDraft = { complaint: string; findings: string; plan: string; alertsReviewed: boolean; items: TreatmentItem[]; completed: boolean };
export const emptyVisit: VisitDraft = { complaint: '', findings: '', plan: '', alertsReviewed: false, items: [], completed: false };

export const initialVisits: Record<string, VisitDraft> = {
  'A-1': { complaint: 'Synthetic demo: routine consultation.', findings: 'Fictional completed visit for exploring the billing workflow.', plan: 'Demo consultation item recorded.', alertsReviewed: true, items: [{ id: 'item-demo-consultation', procedure: 'Consultation', tooth: '', status: 'Completed' }], completed: true },
};
