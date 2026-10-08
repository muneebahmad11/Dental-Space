import { z } from 'zod';
export const appointmentStatuses=['booked','confirmed','arrived','waiting','in_treatment','completed','cancelled','no_show'] as const;
export type AppointmentStatus=typeof appointmentStatuses[number];
export const statusLabels:Record<AppointmentStatus,string>={booked:'Booked',confirmed:'Confirmed',arrived:'Arrived',waiting:'Waiting',in_treatment:'In treatment',completed:'Completed',cancelled:'Cancelled',no_show:'No-show'};
// Clinic-approved shortcuts (decision register): booked can go straight to arrived; arrived can skip waiting.
// A no-show can be corrected to arrived when a late patient turns up. Completed and cancelled are final.
export const transitions:Record<AppointmentStatus,readonly AppointmentStatus[]>={booked:['confirmed','arrived','cancelled','no_show'],confirmed:['arrived','cancelled','no_show'],arrived:['waiting','in_treatment','cancelled'],waiting:['in_treatment','cancelled'],in_treatment:['completed'],completed:[],cancelled:[],no_show:['arrived']};
export const canTransition=(from:AppointmentStatus,to:AppointmentStatus)=>transitions[from].includes(to);
export const transitionNeedsNote=(from:AppointmentStatus,to:AppointmentStatus)=>to==='cancelled'||(from==='no_show'&&to==='arrived');
// Statuses whose time slot is still occupied for conflict checks.
export const occupyingStatuses=['booked','confirmed','arrived','waiting','in_treatment','completed'] as const satisfies readonly AppointmentStatus[];
export const reschedulableStatuses=['booked','confirmed'] as const satisfies readonly AppointmentStatus[];
export const visitStartStatuses=['arrived','waiting','in_treatment'] as const satisfies readonly AppointmentStatus[];
export const reminderStatuses=['booked','confirmed'] as const satisfies readonly AppointmentStatus[];
export const bookingSources=['phone','in_person','walk_in','follow_up','online','other'] as const;
export const sourceLabels:Record<typeof bookingSources[number],string>={phone:'Phone call',in_person:'At reception',walk_in:'Walk-in',follow_up:'Follow-up',online:'Online',other:'Other'};
const instant=z.iso.datetime({offset:true}).transform(v=>new Date(v));
const text=(max:number)=>z.string().trim().max(max).default('');
const minute=60000;
const validLength=(v:{startsAt:Date;endsAt:Date})=>+v.startsAt%minute===0&&+v.endsAt%minute===0&&+v.endsAt-+v.startsAt>=5*minute&&+v.endsAt-+v.startsAt<=8*60*minute;
// Supplied only when staff knowingly book over a conflict or outside opening hours.
export const overrideInput=z.object({reason:z.string().trim().min(3).max(300)}).strict().nullable().default(null);
const resources={dentistId:z.uuid().nullable().default(null),chairId:z.uuid().nullable().default(null)};
export const bookingInput=z.object({operationId:z.uuid(),patientId:z.uuid(),startsAt:instant,endsAt:instant,...resources,procedureId:z.uuid().nullable().default(null),reason:text(240),notes:text(1000),nextAction:text(240),source:z.enum(bookingSources).default('phone'),override:overrideInput}).strict().refine(validLength,'Bookings run 5 minutes to 8 hours on whole minutes.');
export const statusInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),status:z.enum(appointmentStatuses),note:text(500)}).strict();
export const rescheduleInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),startsAt:instant,endsAt:instant,...resources,override:overrideInput,note:text(500)}).strict().refine(validLength,'Bookings run 5 minutes to 8 hours on whole minutes.');
export const detailsInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),procedureId:z.uuid().nullable(),reason:text(240),notes:text(1000),nextAction:text(240)}).strict();
export const walkInInput=z.object({operationId:z.uuid(),patientId:z.uuid(),...resources,procedureId:z.uuid().nullable().default(null),minutes:z.number().int().min(5).max(480),reason:text(240),notes:text(1000)}).strict();
export const appointmentQuery=z.object({startsAt:instant,endsAt:instant,dentistId:z.uuid().optional(),patientId:z.uuid().optional()}).strict().refine(v=>v.endsAt>v.startsAt&&+v.endsAt-+v.startsAt<=31*24*60*minute,'Select a range of up to 31 days.');
export type AppointmentEventDetail={note?:string;startsAt?:string;endsAt?:string;previousStartsAt?:string;previousEndsAt?:string;dentistId?:string|null;previousDentistId?:string|null;chairId?:string|null;previousChairId?:string|null;procedureId?:string|null;reason?:string;notes?:string;nextAction?:string;source?:string;override?:string;durationOverride?:boolean;visitId?:string};
