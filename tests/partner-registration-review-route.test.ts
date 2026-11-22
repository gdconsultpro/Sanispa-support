import { test } from "node:test";
import assert from "node:assert/strict";
import { PATCH } from "../app/api/admin/partners/[id]/route";
const app="https://app.fixture.invalid",db="https://db.fixture.invalid",admin="70000000-0000-4000-8000-000000000001",partner="70000000-0000-4000-8000-000000000002";
const approval = { verify: true, expectedSiret: "00000000000000" };
const sentAt = "2026-11-22T10:30:00+00:00";
test("SIRET review requires the real administrator MFA session and cannot be self-attested",async()=>{
 const prev=globalThis.fetch,env={...process.env};Object.assign(process.env,{NEXT_PUBLIC_APP_URL:app,NEXT_PUBLIC_SUPABASE_URL:db,SUPABASE_SERVICE_ROLE_KEY:"fixture"});
 let isAdmin=true,mfa=true,approved=false,denied=false,stale=false;
 const key = "partner-approval:" + partner;
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input));assert.equal(u.origin,db);
 if(u.pathname==="/auth/v1/user")return Response.json({id:admin,email:"admin@example.invalid",email_confirmed_at:"2026-01-01",app_metadata:{}});
 if(u.pathname.endsWith("/rpc/private_session_status"))return Response.json({active:true,is_admin:isAdmin,mfa_verified:mfa});
 if(u.pathname.endsWith("/rpc/notify_partner_approval")){const body=JSON.parse(String(init?.body));assert.deepEqual(body,{p_partner:partner,p_actor:admin,p_expected_siret:body.p_expected_siret === null ? null : approval.expectedSiret});if(stale||denied)return Response.json({message:stale?"SIRET_CHANGED":"INCOMPLETE_REGISTRATION"},{status:400});approved=true;return Response.json(key);}
 if(u.pathname.endsWith("/rpc/claim_notifications")) { assert.deepEqual(JSON.parse(String(init?.body)), { p_key: key }); return Response.json([]); }
 if(u.pathname.endsWith("/rpc/admin_partner_approval_email_statuses")) {
  assert.deepEqual(JSON.parse(String(init?.body)), { p_partners: [partner] });
  return Response.json([{ partner_id: partner, state: "sent", sent_at: sentAt }]);
 }
 if(u.pathname==="/rest/v1/partners")return Response.json({id:partner,company_name:"TEST",siret:stale?"11111111111111":"00000000000000",verification_status:stale?"pending":"verified",partner_departments:[]});
 throw new Error("Unexpected "+u.pathname);};
 const request=(body:unknown,origin=app)=>{const jwt=`e30.${Buffer.from(JSON.stringify({sub:admin,session_id:"70000000-0000-4000-8000-000000000010",role:"authenticated",aal:"aal2",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")}.fixture`;return new Request(app+"/api/admin/partners/"+partner,{method:"PATCH",headers:{Authorization:`Bearer ${jwt}`,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)});};
 const context={params:Promise.resolve({id:partner})};
 try{
 isAdmin=false;assert.equal((await PATCH(request(approval),context)).status,403);isAdmin=true;mfa=false;assert.equal((await PATCH(request(approval),context)).status,403);mfa=true;
 assert.equal((await PATCH(request(approval,"https://evil.invalid"),context)).status,403);
 assert.equal((await PATCH(request({verification_status:"verified"}),context)).status,400);assert.equal((await PATCH(request({siret:"123"}),context)).status,400);assert.equal(approved,false);
 assert.equal((await PATCH(request({verify:true}),context)).status,400);
 stale=true;const changed=await PATCH(request(approval),context);assert.equal(changed.status,409);assert.equal((await changed.json()).partner.siret,"11111111111111");assert.equal(approved,false);stale=false;
 const r=await PATCH(request(approval),context);assert.equal(r.status,200);
 const result = await r.json();
 assert.equal(result.partner.verification_status,"verified");assert.equal(result.approvalEmail,"sent");assert.equal(approved,true);
 assert.deepEqual(result.partner.approval_email, { state: "sent", sent_at: sentAt });
 assert.equal((await PATCH(request({sendApproval:true}),context)).status,200);
 denied=true;assert.equal((await PATCH(request(approval),context)).status,409);
 }finally{globalThis.fetch=prev;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
