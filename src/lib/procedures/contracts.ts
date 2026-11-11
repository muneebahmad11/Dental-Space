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
// A starting list for a new clinic. Prices are left empty on purpose: every clinic sets its own.
export const starterProcedures:readonly {name:string;category:typeof procedureCategories[number];defaultMinutes:number}[]=[
 {name:'Consultation',category:'Consultation',defaultMinutes:15},{name:'Follow-up visit',category:'Consultation',defaultMinutes:15},{name:'Emergency visit',category:'Consultation',defaultMinutes:30},
 {name:'Periapical X-ray',category:'Diagnostic',defaultMinutes:10},{name:'OPG X-ray',category:'Diagnostic',defaultMinutes:15},
 {name:'Scaling and polishing',category:'Preventive',defaultMinutes:30},{name:'Fluoride application',category:'Preventive',defaultMinutes:15},
 {name:'Composite filling',category:'Restorative',defaultMinutes:30},{name:'Temporary filling',category:'Restorative',defaultMinutes:20},
 {name:'Root canal treatment (single canal)',category:'Endodontic',defaultMinutes:60},{name:'Root canal treatment (multi canal)',category:'Endodontic',defaultMinutes:90},{name:'Pulpotomy',category:'Pediatric',defaultMinutes:30},
 {name:'Simple extraction',category:'Oral surgery',defaultMinutes:30},{name:'Surgical extraction',category:'Oral surgery',defaultMinutes:60},{name:'Wisdom tooth removal',category:'Oral surgery',defaultMinutes:60},
 {name:'Crown (PFM)',category:'Prosthodontic',defaultMinutes:60},{name:'Crown (zirconia)',category:'Prosthodontic',defaultMinutes:60},{name:'Complete denture',category:'Prosthodontic',defaultMinutes:45},
 {name:'Teeth whitening',category:'Cosmetic',defaultMinutes:60},{name:'Orthodontic adjustment',category:'Orthodontic',defaultMinutes:20},
];
