import '../../scripts/load-env.ts';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { runtimeEnvironment,connectionOptions } from '../lib/config/environment.ts';
import { messagingConfig } from '../server/messaging/config.ts';
import { cloudSender } from '../server/messaging/provider.ts';
import { processOneMessage } from '../server/messaging/worker.ts';
import { applyDeliveryEvents } from '../server/messaging/webhook.ts';
async function main(){
 const config=messagingConfig(process.env);if(!config){console.log('WhatsApp worker disabled. Configure Meta before enabling it.');return;}
 const {DATABASE_URL:url}=runtimeEnvironment(process.env);const client=postgres(url,connectionOptions(url));const db=drizzle(client);const send=cloudSender(config);let stopping=false;
 const stop=()=>{stopping=true;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 console.log('WhatsApp worker started.');
 try{while(!stopping){try{await applyDeliveryEvents(db,config);if(!await processOneMessage(db,config,send))await new Promise(resolve=>setTimeout(resolve,2000));}catch{console.error('WhatsApp worker operation failed; retrying after delay.');await new Promise(resolve=>setTimeout(resolve,5000));}}}finally{await client.end();console.log('WhatsApp worker stopped.');}
}
main().catch(()=>{console.error('WhatsApp worker configuration failed. No credentials logged.');process.exitCode=1;});
