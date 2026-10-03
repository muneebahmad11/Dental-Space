import { z } from 'zod';
const templateSchema=z.object({name:z.string().regex(/^[a-z0-9_]{1,100}$/),language:z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),label:z.string().min(1).max(100),parameters:z.array(z.string().min(1).max(60)).max(10)}).strict();
export type MessageTemplate=z.infer<typeof templateSchema>;
export function messagingConfig(values:Record<string,string|undefined>){
 const enabled=values.WHATSAPP_ENABLED==='true';
 if(!enabled)return null;
 const result=z.object({WHATSAPP_CLINIC_ID:z.uuid(),WHATSAPP_BUSINESS_ACCOUNT_ID:z.string().regex(/^\d+$/),WHATSAPP_PHONE_NUMBER_ID:z.string().regex(/^\d+$/),WHATSAPP_API_VERSION:z.string().regex(/^v\d+\.\d+$/),WHATSAPP_ACCESS_TOKEN:z.string().min(10),WHATSAPP_APP_SECRET:z.string().min(16),WHATSAPP_VERIFY_TOKEN:z.string().min(16)}).safeParse(values);
 if(!result.success)throw new Error('WhatsApp configuration is incomplete or invalid.');
 let templates:MessageTemplate[];
 try{templates=z.array(templateSchema).max(30).parse(JSON.parse(values.WHATSAPP_TEMPLATES_JSON||'[]'));}catch{throw new Error('WhatsApp template configuration is invalid.');}
 if(new Set(templates.map(t=>t.name+':'+t.language)).size!==templates.length)throw new Error('WhatsApp template configuration contains duplicates.');
 return {...result.data,templates};
}
export type MessagingConfig=NonNullable<ReturnType<typeof messagingConfig>>;
