import { z } from 'zod';
const note=z.string().trim().max(12000);
export const clinicalBody=z.object({complaint:note,history:note,examination:note,assessment:note,treatment:note,advice:note,followUpOn:z.union([z.iso.date(),z.literal('')])}).strict().refine(v=>new TextEncoder().encode(JSON.stringify(v)).byteLength<=60000,'Clinical note is too large.');
export type ClinicalBody=z.infer<typeof clinicalBody>;
export const emptyClinicalBody:ClinicalBody={complaint:'',history:'',examination:'',assessment:'',treatment:'',advice:'',followUpOn:''};
export const createVisitInput=z.object({patientId:z.uuid(),appointmentId:z.uuid().optional(),operationId:z.uuid()}).strict();
export const draftInput=z.object({expectedVersion:z.number().int().positive(),body:clinicalBody}).strict();
export const finalizationInput=z.object({expectedVersion:z.number().int().positive(),operationId:z.uuid()}).strict();
export const amendmentInput=z.object({expectedVersion:z.number().int().positive(),operationId:z.uuid(),reason:z.string().trim().min(3).max(500),body:clinicalBody}).strict();
