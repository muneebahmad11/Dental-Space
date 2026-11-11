import { z } from 'zod';
export const amountInput=z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/).transform(v=>{const [whole,fraction='']=v.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}).refine(v=>v>0&&v<=99999999);
export const chargeInput=z.object({operationId:z.uuid(),patientId:z.uuid(),description:z.string().trim().min(2).max(240),amount:amountInput}).strict();
export const paymentInput=z.object({operationId:z.uuid(),patientId:z.uuid(),amount:amountInput,method:z.string().trim().min(2).max(40),paidOn:z.iso.date()}).strict();
export function moneyMinor(value:number|string){const raw=BigInt(value);const amount=raw<BigInt(0)?-raw:raw;return `PKR ${raw<BigInt(0)?'-':''}${amount/BigInt(100)}.${(amount%BigInt(100)).toString().padStart(2,'0')}`;}
export function businessDate(timezone:string,instant=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);return ['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-');}

export const refundInput=z.object({operationId:z.uuid(),amount:amountInput,paidOn:z.iso.date(),reason:z.string().trim().min(3).max(500)}).strict();
const reason=z.string().trim().min(3).max(500);
export const creditNoteInput=z.object({operationId:z.uuid(),amount:amountInput,reason}).strict();
export const correctionInput=z.object({operationId:z.uuid(),reason,description:z.string().trim().min(2).max(240),amount:amountInput}).strict();
