import { z } from 'zod';
export const preferenceInput = z.object({ patientId:z.uuid(), expectedVersion:z.number().int().min(0), enabled:z.boolean(), evidence:z.string().trim().min(3).max(240) }).strict();
export const messageInput = z.object({ patientId:z.uuid(), operationId:z.uuid(), template:z.string().regex(/^[a-z0-9_]{1,100}$/), language:z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/), parameters:z.array(z.string().trim().min(1).max(200)).max(10), appointmentId:z.uuid().optional(), appointmentVersion:z.number().int().positive().optional(), scheduledAt:z.iso.datetime({offset:true}).optional() }).strict().refine(v=>Boolean(v.appointmentId)===Boolean(v.appointmentVersion));
export function recipientNumber(phone:string){const clean=phone.replace(/[\s()+-]/g,'');return /^[1-9]\d{7,14}$/.test(clean)?clean:null;}
export function retryDelay(attempt:number){return Math.min(3600,30*2**Math.max(0,attempt-1));}
export function deliveryRank(status:string){return ({sent:1,delivered:2,read:3} as Record<string,number>)[status]??0;}
