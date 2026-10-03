import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { MessagingConfig } from './config.ts';
export function verifySignature(body:Uint8Array,signature:string|null,secret:string){
 if(!signature||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const expected=createHmac('sha256',secret).update(body).digest();const actual=Buffer.from(signature.slice(7),'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export type SendOutcome={kind:'accepted';providerMessageId:string}|{kind:'retry'|'failed'|'review';code:string};
export type OutboundMessage={recipient:string;template:string;language:string;parameters:string[]};
export type MessageSender=(message:OutboundMessage)=>Promise<SendOutcome>;
export function cloudSender(config:MessagingConfig,fetcher:typeof fetch=fetch):MessageSender{
 return async message=>{
  try{
   const response=await fetcher(`https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:message.recipient,type:'template',template:{name:message.template,language:{code:message.language},...(message.parameters.length?{components:[{type:'body',parameters:message.parameters.map(text=>({type:'text',text}))}]}:{})}})});
   if(response.status===429)return {kind:'retry',code:'PROVIDER_RATE_LIMIT'};
   if(response.status===408||response.status>=500)return {kind:'review',code:'PROVIDER_AMBIGUOUS'};
   if(!response.ok)return {kind:'failed',code:'PROVIDER_REJECTED'};
   const result=z.object({messages:z.array(z.object({id:z.string().min(1).max(200)})).min(1)}).safeParse(await response.json());
   return result.success?{kind:'accepted',providerMessageId:result.data.messages[0].id}:{kind:'review',code:'PROVIDER_RESPONSE_INVALID'};
  }catch{return {kind:'review',code:'PROVIDER_CONNECTION_AMBIGUOUS'};}
 };
}
