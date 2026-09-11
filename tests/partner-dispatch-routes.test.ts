import {test} from 'node:test';import assert from 'node:assert/strict';
import {GET as list} from '../app/api/partner/leads/route';
import {GET as detail} from '../app/api/partner/leads/[id]/route';
import {POST as acquire} from '../app/api/partner/leads/[id]/checkout/route';
import {ids} from './helpers/dispatch-fixture';
const app='https://app.fixture.invalid',base='https://db.fixture.invalid';
const token=`e30.${Buffer.from(JSON.stringify({sub:ids.user,role:'authenticated',session_id:'00000000-0000-4000-8000-000000000050',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
function request(path:string,post=false){return new Request(app+path,{method:post?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Origin:app,'Content-Type':'application/json'}});}
async function fixture(run:(state:any)=>Promise<void>){
 const fetchBefore=globalThis.fetch,env={...process.env};Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'fixture-only',NEXT_PUBLIC_APP_URL:app});
 const s={acquisitions:0,row:{id:ids.d,choice:'intervention',request_type:'TECHNICAL_REQUEST',created_at:'2026-09-11T09:00:00Z',status:'AVAILABLE',matched_partner_ids:[ids.a],partner_released_at:null as string|null,partner_kept_at:null as string|null,assigned_partner_id:null,archived_at:null,customers:{name:'PRIVATE CUSTOMER',email:'private@example.invalid',phone:'PRIVATE PHONE',address:'PRIVATE ADDRESS',spa_brand:'TEST',spa_model:'TEST'},diagnostic_answers:[],diagnostic_photos:[]}};
 globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input));assert.equal(url.origin,base,'No email/payment network permitted');
   if(url.pathname==='/auth/v1/user')return Response.json({id:ids.user,email_confirmed_at:'2026-09-11',app_metadata:{}});
   if(url.pathname.endsWith('/rpc/private_session_status'))return Response.json({active:true,is_admin:false,mfa_verified:false});
   if(url.pathname.endsWith('/partner_users'))return Response.json([{role:'owner',active:true,partners:{id:ids.a,company_name:'TEST',email:'test@example.invalid',active:true,leads_paid:false}}]);
   if(url.pathname.endsWith('/diagnostics'))return Response.json(url.searchParams.has('id')?s.row:[s.row]);
   if(url.pathname.endsWith('/lead_purchases'))return Response.json([]);
   if(url.pathname.endsWith('/rpc/prepare_partner_acquisition')){s.acquisitions++;return Response.json({message:'LEAD_UNAVAILABLE'},{status:400});}
   throw Error(`Unexpected ${url.pathname} ${init?.method}`);
 };
 try{await run(s);}finally{globalThis.fetch=fetchBefore;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
}
test('list and direct API reveal nothing before validation or after keeping internally',()=>fixture(async s=>{
 for(const kept of [null,'2026-09-11T12:00:00Z']){
 s.row.partner_kept_at=kept;
 const l=await list(request('/api/partner/leads'));assert.equal(l.status,200);assert.deepEqual((await l.json()).leads,[]);
 const d=await detail(request(`/api/partner/leads/${ids.d}`),{params:Promise.resolve({id:ids.d})});assert.equal(d.status,403);assert.doesNotMatch(await d.text(),/PRIVATE/);
 }
}));
test('selected partner receives only an anonymous offer; a different selection is denied',()=>fixture(async s=>{
 s.row.partner_released_at='2026-09-11T12:00:00Z';
 const l=await list(request('/api/partner/leads'));const leads=(await l.json()).leads;assert.equal(leads.length,1);assert.equal(leads[0].billing.paymentRequired,false);assert.equal(leads[0].access,'preview');
 let d=await detail(request(`/api/partner/leads/${ids.d}`),{params:Promise.resolve({id:ids.d})});assert.equal(d.status,200);const body=await d.json();assert.equal(body.lead.customer,undefined);assert.equal(body.lead.access,'preview');
 s.row.matched_partner_ids=[ids.b];d=await detail(request(`/api/partner/leads/${ids.d}`),{params:Promise.resolve({id:ids.d})});assert.equal(d.status,403);assert.doesNotMatch(await d.text(),/PRIVATE/);
}));
test('direct acquisition route obeys database denial without any payment request',()=>fixture(async s=>{
 const r=await acquire(request(`/api/partner/leads/${ids.d}/checkout`,true),{params:Promise.resolve({id:ids.d})});assert.equal(r.status,403);assert.equal(s.acquisitions,1);
}));
