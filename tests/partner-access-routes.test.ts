import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as session } from "../app/api/partner/session/route";
import { GET as lead } from "../app/api/partner/leads/[id]/route";
import { POST as createAccess } from "../app/api/admin/partners/[id]/access/route";
const uid='00000000-0000-4000-8000-000000000001', pid='00000000-0000-4000-8000-000000000010', other='00000000-0000-4000-8000-000000000011', did='00000000-0000-4000-8000-000000000020';
const base='https://auth-fixture.invalid', app='https://app-fixture.invalid';
const token=`e30.${Buffer.from(JSON.stringify({sub:uid,role:'authenticated',session_id:'00000000-0000-4000-8000-000000000050',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
function request(path:string,body?:unknown){return new Request(app+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Origin:app,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function fixture(run:(state:any)=>Promise<void>){
 const oldFetch=globalThis.fetch;const keys=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_APP_URL'];const prev=keys.map(k=>process.env[k]);
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'fixture-only',NEXT_PUBLIC_APP_URL:app});
 const state={required:true,linked:true,inactive:false,authValid:true,reads:0,mutations:0};
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,base);if(init?.method && !['GET','POST'].includes(init.method))state.mutations++;
  if(url.pathname==='/auth/v1/user')return state.authValid?Response.json({id:uid,email_confirmed_at:'2026-09-11',app_metadata:{partner_password_change_required:state.required}}):Response.json({msg:'invalid',code:'bad_jwt'},{status:401});
  if(url.pathname==='/rest/v1/rpc/private_session_status')return Response.json({active:true,is_admin:false,mfa_verified:false});
  if(url.pathname==='/rest/v1/partner_users')return Response.json(state.linked?[{role:'owner',active:!state.inactive,partners:{id:pid,company_name:'Fictif',email:'fictif@example.invalid',active:true,leads_paid:false}}]:[]);
  if(url.pathname==='/rest/v1/diagnostics'){state.reads++;return Response.json({id:did,request_type:'TECHNICAL_REQUEST',assigned_partner_id:other,matched_partner_ids:[pid]});}
  state.mutations++;throw new Error(`Unexpected ${url.pathname}`);
 };
 try{await run(state);}finally{globalThis.fetch=oldFetch;keys.forEach((k,i)=>{if(prev[i]===undefined)delete process.env[k];else process.env[k]=prev[i];});}
}
test('successful Auth and absent or inactive access are explicit failures',()=>fixture(async s=>{
 s.linked=false;let r=await session(request('/api/partner/session'));assert.equal(r.status,403);assert.match((await r.json()).error,/connexion est réussie.*aucune entreprise/);
 s.linked=true;s.inactive=true;r=await session(request('/api/partner/session'));assert.equal(r.status,403);assert.match((await r.json()).error,/désactivé/);
}));
test('mandatory change permits only the account screen, and blocks dossier reads server-side',()=>fixture(async s=>{
 const r=await session(request('/api/partner/session'));assert.equal(r.status,200);assert.equal((await r.json()).passwordChangeRequired,true);
 const detail=await lead(request(`/api/partner/leads/${did}`),{params:Promise.resolve({id:did})});assert.equal(detail.status,428);assert.equal(s.reads,0);
}));
test('after personal-password change another partner assignment still denies access',()=>fixture(async s=>{
 s.required=false;const r=await lead(request(`/api/partner/leads/${did}`),{params:Promise.resolve({id:did})});assert.equal(r.status,403);assert.match((await r.json()).error,/autre partenaire/);
}));
test('partner cannot create or relink access through the administrator route',()=>fixture(async s=>{
 const r=await createAccess(request(`/api/admin/partners/${pid}/access`,{mode:'create',email:'fictif@example.invalid',name:'TEST',password:'Fictitious-password-only'}),{params:Promise.resolve({id:pid})});assert.equal(r.status,403);assert.equal(s.mutations,0);
}));
