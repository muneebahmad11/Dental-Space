import { timingSafeEqual } from 'node:crypto';
import { getDatabase } from '@/server/db/client';
import { messagingConfig } from '@/server/messaging/config';
import { verifySignature } from '@/server/messaging/provider';
import { receiveWebhook } from '@/server/messaging/webhook';
import { failure,response } from '@/server/http/patient-request';
import { AppError } from '@/server/http/errors';
export const dynamic='force-dynamic';
function config(){const c=messagingConfig(process.env);if(!c)throw new AppError(503,'WHATSAPP_DISABLED','WhatsApp is disabled.');return c;}
export async function GET(request:Request){try{const c=config();const q=new URL(request.url).searchParams;const token=Buffer.from(q.get('hub.verify_token')??'');const expected=Buffer.from(c.WHATSAPP_VERIFY_TOKEN);const challenge=q.get('hub.challenge');if(q.get('hub.mode')!=='subscribe'||token.length!==expected.length||!timingSafeEqual(token,expected)||!challenge||!/^\d{1,100}$/.test(challenge))throw new AppError(403,'VERIFICATION_FAILED','Webhook verification failed.');return new Response(challenge,{headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const c=config();const reader=request.body?.getReader();if(!reader)throw new AppError(400,'INVALID_BODY','Webhook body required.');const parts:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();throw new AppError(413,'BODY_TOO_LARGE','Webhook body too large.');}parts.push(value);}}finally{reader.releaseLock();}const body=Buffer.concat(parts);if(!verifySignature(body,request.headers.get('x-hub-signature-256'),c.WHATSAPP_APP_SECRET))throw new AppError(401,'INVALID_SIGNATURE','Webhook signature invalid.');let payload:unknown;try{payload=JSON.parse(body.toString('utf8'));}catch{throw new AppError(400,'INVALID_JSON','Invalid webhook JSON.');}await receiveWebhook(getDatabase(),payload,c);return response({received:true});}catch(e){return failure(e);}}
