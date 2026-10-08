import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { contactAllowed,contactPreferenceBody,saveContactPreferencesInput,type ContactPreferenceBody } from '../src/lib/contact-preferences/contracts.ts';
const body:ContactPreferenceBody={doNotContact:false,preferredChannel:'whatsapp',channels:{phone:true,sms:false,whatsapp:true,email:false},purposes:{appointment:true,recall:false,billing:true,marketing:false},note:'',source:'in_person'};
test('channel and purpose must both be allowed; do-not-contact overrides everything',()=>{
 assert.equal(contactAllowed(body,'whatsapp','appointment'),true);assert.equal(contactAllowed(body,'whatsapp','recall'),false);assert.equal(contactAllowed(body,'sms','appointment'),false);
 assert.equal(contactAllowed({...body,doNotContact:true},'phone','appointment'),false);
 assert.equal(contactAllowed(null,'whatsapp','marketing'),true,'not recorded adds no restriction beyond channel consent');
});
test('a preferred channel must be allowed and inputs are strict',()=>{
 assert.equal(contactPreferenceBody.safeParse({...body,preferredChannel:'email'}).success,false);
 assert.equal(contactPreferenceBody.safeParse({...body,channels:{...body.channels,fax:true}}).success,false);
 assert.equal(saveContactPreferencesInput.safeParse({operationId:randomUUID(),expectedVersion:0,body,reason:'ok'}).success,false);
 assert.equal(saveContactPreferencesInput.safeParse({operationId:randomUUID(),expectedVersion:0,body,reason:'Asked at reception'}).success,true);
});
