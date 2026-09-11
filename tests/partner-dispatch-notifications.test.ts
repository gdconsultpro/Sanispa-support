import {test} from 'node:test';import assert from 'node:assert/strict';
import {processNotifications} from '../lib/notifications';
import {canNotifyPartnerOffer,partnerNotificationLabel} from '../lib/partner-release';
import {ids,releaseJob} from './helpers/dispatch-fixture';
async function fixture(run:(s:any)=>Promise<void>){
 const oldFetch=globalThis.fetch;const env={...process.env};
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://db.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock-only',NEXT_PUBLIC_APP_URL:'https://app.fixture.invalid',EMAIL_PROVIDER:'resend',RESEND_API_KEY:'mock-only'});
 const key=`${ids.d}:manual-partner:${ids.a}`;
 const state={released:false,kept:false,sent:0,requests:[] as string[],failPersist:false,job:{id:'job-fixture',key,kind:'partner',payload:{...releaseJob(),notificationKey:key},state:'pending',sent_at:null,first_delivery_attempt_at:new Date().toISOString(),locked:false}};
 const deliveries=new Map();
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));const body=init?.body?JSON.parse(String(init.body)):{};
  if(url.origin==='https://api.resend.com'){
   assert.equal(state.released,true);assert.equal(state.kept,false);assert.equal(body.to,'a@example.invalid');assert.ok(body.html.includes('Consulter la demande'));
   const k=new Headers(init?.headers).get('Idempotency-Key')!;state.requests.push(k);
   if(!deliveries.has(k)){state.sent++;deliveries.set(k,{id:'simulated-delivery'});}
   return Response.json(deliveries.get(k));
  }
  assert.equal(url.origin,'https://db.fixture.invalid',`Unexpected network ${url.origin}`);
  if(url.pathname.endsWith('/rpc/claim_notifications')) {if(state.job.state!=='pending'||state.job.locked)return Response.json([]);state.job.locked=true;return Response.json([state.job]);}
  if(url.pathname.endsWith('/diagnostics'))return Response.json({choice:'intervention',request_type:'TECHNICAL_REQUEST',partner_released_at:state.released?'2026-09-11':null,partner_kept_at:state.kept?'2026-09-11':null,matched_partner_ids:[ids.a],assigned_partner_id:null,archived_at:null,status:'AVAILABLE'});
  if(url.pathname.endsWith('/notification_jobs')){
    if(body.state==='sent'&&state.failPersist){state.failPersist=false;return Response.json({message:'simulated acknowledgement write failure'},{status:500});}
    Object.assign(state.job,body);return new Response(null,{status:204});
  }
  throw Error(`Unexpected ${url.pathname}`);
 };
 try{await run(state);}finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
}
test('old queued notifications cannot reveal an unvalidated or internally kept intervention',async()=>{
 await fixture(async s=>{await processNotifications();assert.equal(s.sent,0);assert.equal(s.job.state,'cancelled');});
 await fixture(async s=>{s.kept=true;await processNotifications();assert.equal(s.sent,0);assert.equal(s.job.state,'cancelled');});
});
test('selected recipient only; provider accepts once even if the server loses the acknowledgement',()=>fixture(async s=>{
 s.released=true;s.failPersist=true;await processNotifications();assert.equal(s.sent,1);assert.equal(s.job.state,'pending');
 s.job.locked=false;await processNotifications();assert.equal(s.sent,1);assert.equal(s.job.state,'sent');assert.ok(s.job.sent_at);assert.deepEqual(s.requests,[s.job.key,s.job.key]);
 s.job.locked=false;await processNotifications();assert.equal(s.requests.length,2);
}));
test('uncertain delivery stops before provider deduplication expiry and is never displayed as sent',()=>fixture(async s=>{
 s.released=true;s.job.first_delivery_attempt_at=new Date(Date.now()-24*60*60*1000).toISOString();await processNotifications();assert.equal(s.sent,0);assert.equal(s.job.state,'delivery_unknown');
 assert.match(partnerNotificationLabel({state:s.job.state,sentAt:null}),/à vérifier/);assert.match(partnerNotificationLabel({state:'pending',sentAt:null}),/en attente/);
 assert.doesNotMatch(partnerNotificationLabel({state:'sent',sentAt:null}),/^Envoi confirmé/);
}));
test('a notification for a different recipient, legacy automatic job or assigned dossier is rejected',()=>{
 const dossier={choice:'intervention',request_type:'TECHNICAL_REQUEST',partner_released_at:'2026-09-11',matched_partner_ids:[ids.a],status:'AVAILABLE'};
 assert.equal(canNotifyPartnerOffer(dossier,{key:`${ids.d}:manual-partner:${ids.b}`,payload:releaseJob(ids.b)}),false);
 assert.equal(canNotifyPartnerOffer(dossier,{key:`${ids.d}:partner:${ids.a}`,payload:releaseJob()}),false);
 assert.equal(canNotifyPartnerOffer({...dossier,assigned_partner_id:ids.a},{key:`${ids.d}:manual-partner:${ids.a}`,payload:releaseJob()}),false);
});
