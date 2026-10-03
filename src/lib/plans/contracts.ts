import { z } from 'zod';
import { amountInput } from '../finance/contracts.ts';
export const planBodyInput=z.object({title:z.string().trim().min(2).max(120),note:z.string().trim().max(1000),items:z.array(z.object({id:z.uuid(),description:z.string().trim().min(2).max(240),tooth:z.string().trim().max(40),quantity:z.number().int().min(1).max(100),unitPrice:amountInput}).strict()).min(1).max(100)}).strict().refine(body=>new Set(body.items.map(item=>item.id)).size===body.items.length,{message:'Item IDs must be unique.'});
export const createPlanInput=z.object({operationId:z.uuid(),patientId:z.uuid(),body:planBodyInput}).strict();
export const savePlanInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),body:planBodyInput}).strict();
export const acceptPlanInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),acceptedBy:z.string().trim().min(2).max(160),evidence:z.string().trim().min(3).max(500)}).strict();
export type PlanSnapshot={title:string;note:string;currency:'PKR';totalMinor:string;items:{id:string;description:string;tooth:string;quantity:number;unitPriceMinor:number;totalMinor:string}[]};
export function planSnapshot(body:z.output<typeof planBodyInput>):PlanSnapshot{
 const items=body.items.map(item=>({id:item.id,description:item.description,tooth:item.tooth,quantity:item.quantity,unitPriceMinor:item.unitPrice,totalMinor:(BigInt(item.unitPrice)*BigInt(item.quantity)).toString()}));
 return {title:body.title,note:body.note,currency:'PKR',items,totalMinor:items.reduce((sum,item)=>sum+BigInt(item.totalMinor),BigInt(0)).toString()};
}
