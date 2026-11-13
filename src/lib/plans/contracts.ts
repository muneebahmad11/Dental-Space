import { z } from 'zod';
import { amountInput } from '../finance/contracts.ts';
const blank=(v:unknown)=>v===''||v===null?undefined:v;
const subtotal=(items:{quantity:number;unitPrice:number}[])=>items.reduce((sum,item)=>sum+BigInt(item.unitPrice)*BigInt(item.quantity),BigInt(0));
// An estimate may carry one discount off its total (with a reason) and a date it stays valid until.
export const planBodyInput=z.object({title:z.string().trim().min(2).max(120),note:z.string().trim().max(1000),items:z.array(z.object({id:z.uuid(),description:z.string().trim().min(2).max(240),tooth:z.string().trim().max(40),quantity:z.number().int().min(1).max(100),unitPrice:amountInput}).strict()).min(1).max(100),
 discount:z.preprocess(blank,amountInput.optional()),discountReason:z.preprocess(blank,z.string().trim().min(3).max(200).optional()),validUntil:z.preprocess(blank,z.iso.date().optional())}).strict()
 .refine(body=>new Set(body.items.map(item=>item.id)).size===body.items.length,{message:'Item IDs must be unique.'})
 .refine(body=>!body.discount===!body.discountReason,{message:'A discount needs a reason.'})
 .refine(body=>!body.discount||BigInt(body.discount)<subtotal(body.items),{message:'The discount must be less than the estimate total.'});
export const createPlanInput=z.object({operationId:z.uuid(),patientId:z.uuid(),body:planBodyInput}).strict();
export const savePlanInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),body:planBodyInput}).strict();
export const acceptPlanInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),acceptedBy:z.string().trim().min(2).max(160),evidence:z.string().trim().min(3).max(500)}).strict();
export type PlanSnapshot={title:string;note:string;currency:'PKR';totalMinor:string;subtotalMinor?:string;discountMinor?:string;discountReason?:string;validUntil?:string;items:{id:string;description:string;tooth:string;quantity:number;unitPriceMinor:number;totalMinor:string}[]};
export function planSnapshot(body:z.output<typeof planBodyInput>):PlanSnapshot{
 const items=body.items.map(item=>({id:item.id,description:item.description,tooth:item.tooth,quantity:item.quantity,unitPriceMinor:item.unitPrice,totalMinor:(BigInt(item.unitPrice)*BigInt(item.quantity)).toString()}));
 const sub=items.reduce((sum,item)=>sum+BigInt(item.totalMinor),BigInt(0));const discount=BigInt(body.discount??0);
 return {title:body.title,note:body.note,currency:'PKR',items,subtotalMinor:sub.toString(),discountMinor:discount.toString(),...(body.discount?{discountReason:body.discountReason}:{}),...(body.validUntil?{validUntil:body.validUntil}:{}),totalMinor:(sub-discount).toString()};
}
// The share of an estimate's discount that falls on one billed completion, in proportion to its price.
// Rounded to the nearest paisa and always leaves something to pay.
export function discountShare(snapshot:Pick<PlanSnapshot,'subtotalMinor'|'discountMinor'|'totalMinor'>,grossMinor:bigint){
 const discount=BigInt(snapshot.discountMinor??'0');const sub=BigInt(snapshot.subtotalMinor??snapshot.totalMinor);
 if(discount<=BigInt(0)||sub<=BigInt(0)||grossMinor<=BigInt(0))return BigInt(0);
 const share=(grossMinor*discount*BigInt(2)+sub)/(sub*BigInt(2));return share>=grossMinor?grossMinor-BigInt(1):share;
}
export const completeItemInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),itemId:z.uuid(),quantity:z.number().int().min(1).max(100),performedOn:z.iso.date(),note:z.string().trim().min(3).max(1000)}).strict();
export const billCompletionInput=z.object({operationId:z.uuid()}).strict();
