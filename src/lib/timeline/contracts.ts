import { z } from 'zod';
export const timelineCategories=['demographics','appointments','clinical','plans','billing','followups','communications'] as const;
export type TimelineCategory=typeof timelineCategories[number];
export const categoryLabels:Record<TimelineCategory,string>={demographics:'Patient record',appointments:'Appointments',clinical:'Clinical visits',plans:'Treatment plans',billing:'Billing',followups:'Follow-ups & recalls',communications:'Communications'};
export function visibleCategories(permissions:ReadonlySet<string>):TimelineCategory[]{
 if(!permissions.has('patient.demographics.read'))return [];
 const result:TimelineCategory[]=['demographics'];
 if(permissions.has('appointment.read'))result.push('appointments');
 if(permissions.has('patient.clinical.read')){result.push('clinical');if(permissions.has('plan.read'))result.push('plans');if(permissions.has('followup.read'))result.push('followups');}
 if(permissions.has('billing.read'))result.push('billing');
 if(permissions.has('communication.read'))result.push('communications');
 return result;
}
export const timelineQuery=z.object({category:z.enum(['all',...timelineCategories]).default('all'),from:z.iso.date().optional(),to:z.iso.date().optional(),cursor:z.string().max(600).optional()}).strict().refine(q=>!q.from||!q.to||q.from<=q.to,{message:'Choose an ordered date range.'});
export const timelineCursor=z.object({at:z.iso.datetime({offset:true}),key:z.string().regex(/^[a-z_]+:[0-9a-f-]{36}$/).max(100)}).strict();
export type TimelineEvent={key:string;occurredAt:string;category:TimelineCategory;summary:string;amountMinor:string|null;eventDate:string|null;scheduledAt:string|null;actorName:string;href:string};
export type TimelineResult={patient:{id:string;name:string;displayId:string};categories:TimelineCategory[];events:TimelineEvent[];nextCursor:string|null};
