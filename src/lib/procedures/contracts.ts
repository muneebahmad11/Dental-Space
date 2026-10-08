import { z } from 'zod';
import { amountInput } from '../finance/contracts.ts';
export const procedureCategories=['Consultation','Diagnostic','Preventive','Restorative','Endodontic','Periodontal','Prosthodontic','Oral surgery','Orthodontic','Implant','Cosmetic','Pediatric','Other'] as const;
// Catalog prices are defaults only; estimates and charges keep their own snapshot of the price used.
const fields={code:z.string().trim().max(20).regex(/^[A-Za-z0-9._-]*$/),name:z.string().trim().min(2).max(120),category:z.enum(procedureCategories),defaultMinutes:z.number().int().min(5).max(480).refine(v=>v%5===0,'Use 5-minute steps.'),price:amountInput.nullable()};
export const createProcedureInput=z.object({operationId:z.uuid(),...fields}).strict();
export const updateProcedureInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),...fields,active:z.boolean()}).strict();
export const procedureQuery=z.object({search:z.string().trim().max(100).default(''),includeInactive:z.enum(['true','false']).default('false')}).strict();
export type ProcedureSnapshot={code:string;name:string;category:string;defaultMinutes:number;priceMinor:number|null;active:boolean};
export function minorToInput(value:number|null){return value===null?'':`${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`;}
