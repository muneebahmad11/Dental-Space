import { z } from 'zod';
export const followUpTypes=['Post-extraction','RCT review','Crown delivery','Implant review','Suture removal','Orthodontic adjustment','Scaling recall','Periodic check-up','Custom'] as const;
export const followUpStatuses=['due','contacted','booked','completed','closed','unable_to_reach'] as const;
export type FollowUpStatus=typeof followUpStatuses[number];
export const statusLabels:Record<FollowUpStatus,string>={due:'Due',contacted:'Contacted',booked:'Booked',completed:'Completed',closed:'Closed',unable_to_reach:'Unable to Reach'};
export function canTransition(from:FollowUpStatus,to:FollowUpStatus){return from!==to&&from!=='completed'&&from!=='closed';}
export function dueBucket(dueOn:string,today:string){return dueOn<today?'overdue':dueOn===today?'today':'upcoming';}
const note=z.string().trim().min(3).max(1000);
export const createFollowUpInput=z.object({operationId:z.uuid(),patientId:z.uuid(),visitId:z.uuid().nullable().default(null),type:z.enum(followUpTypes),customType:z.string().trim().max(80).default(''),dueOn:z.iso.date(),assigneeId:z.uuid().nullable().default(null),note}).strict().refine(v=>v.type==='Custom'?v.customType.length>=2:v.customType==='',{message:'Name custom follow-up types.'});
const mutationBase={operationId:z.uuid(),expectedVersion:z.number().int().positive(),note};
export const followUpMutation=z.discriminatedUnion('action',[
 z.object({...mutationBase,action:z.literal('edit'),dueOn:z.iso.date(),assigneeId:z.uuid().nullable()}).strict(),
 z.object({...mutationBase,action:z.literal('transition'),status:z.enum(followUpStatuses),appointmentId:z.uuid().nullable().default(null)}).strict(),
 z.object({...mutationBase,action:z.literal('contact'),channel:z.enum(['Phone','In person','WhatsApp','SMS','Email','Other']),outcome:z.enum(['Reached','No answer','Left message','Declined','Other'])}).strict(),
]);
const instant=z.iso.datetime({offset:true}).transform(value=>new Date(value));
export const followUpBooking=z.object({...mutationBase,startsAt:instant,endsAt:instant,dentistId:z.uuid().nullable().default(null),chairId:z.uuid().nullable().default(null),procedureId:z.uuid().nullable().default(null),override:z.object({reason:z.string().trim().min(3).max(300)}).strict().nullable().default(null)}).strict().refine(v=>+v.endsAt-+v.startsAt>=60000&&+v.endsAt-+v.startsAt<=8*60*60*1000);
export const followUpQuery=z.object({bucket:z.enum(['all','today','overdue','upcoming']).default('all'),status:z.enum([...followUpStatuses,'open','all']).default('open'),patientId:z.uuid().optional(),assigneeId:z.uuid().optional(),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict();
