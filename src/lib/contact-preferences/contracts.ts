import { z } from 'zod';
export const contactChannels=['phone','sms','whatsapp','email'] as const;
export const contactPurposes=['appointment','recall','billing','marketing'] as const;
export type ContactChannel=typeof contactChannels[number];export type ContactPurpose=typeof contactPurposes[number];
export const channelLabels:Record<ContactChannel,string>={phone:'Phone call',sms:'SMS',whatsapp:'WhatsApp',email:'Email'};
export const purposeLabels:Record<ContactPurpose,string>={appointment:'Appointment confirmations and reminders',recall:'Follow-ups and recalls',billing:'Receipts, estimates and balances',marketing:'Offers and clinic news'};
export const preferenceSources=['in_person','phone','written_form','patient_message','other'] as const;
export const sourceLabels:Record<typeof preferenceSources[number],string>={in_person:'Told staff in person',phone:'Told staff by phone',written_form:'Signed or written form',patient_message:'Patient message (e.g. reply STOP)',other:'Other'};
const flags=<T extends readonly string[]>(keys:T)=>z.object(Object.fromEntries(keys.map(k=>[k,z.boolean()])) as Record<T[number],z.ZodBoolean>).strict();
export const contactPreferenceBody=z.object({doNotContact:z.boolean(),preferredChannel:z.enum([...contactChannels,'none']),channels:flags(contactChannels),purposes:flags(contactPurposes),note:z.string().trim().max(500),source:z.enum(preferenceSources)}).strict()
 .refine(b=>b.preferredChannel==='none'||b.channels[b.preferredChannel],{message:'The preferred channel must be allowed.'});
export type ContactPreferenceBody=z.infer<typeof contactPreferenceBody>;
export const saveContactPreferencesInput=z.object({operationId:z.uuid(),expectedVersion:z.number().int().min(0),body:contactPreferenceBody,reason:z.string().trim().min(3).max(300)}).strict();
// No record means "not recorded": nothing extra is restricted, but nothing is presumed agreed either.
export function contactAllowed(body:ContactPreferenceBody|null,channel:ContactChannel,purpose:ContactPurpose){
 if(!body)return true;return !body.doNotContact&&body.channels[channel]&&body.purposes[purpose];
}
