import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { partnerRegistrationSchema } from "../lib/partner-registration";
import { POST,GET } from "../app/api/partner/registration/route";
import { POST as customerBilling } from "../app/api/client/premium/route";
import { POST as partnerBilling } from "../app/api/partner/subscription/route";
import { clientTokenConfirmationUrl } from "../lib/client-access";
const user="60000000-0000-4000-8000-000000000001",other="60000000-0000-4000-8000-000000000002",third="60000000-0000-4000-8000-000000000003";
const profile={mode:"create",companyName:"Atelier TEST",contactName:"Technicien TEST",phone:"0600000000",siret:"00000000000000",address:"1 rue TEST",postalCode:"67000",city:"Strasbourg",departments:["67","68","67"]};
test("public partner registration is atomic and idempotent, owns one company and does not release clients or create payments",async()=>{
 const db=await fullDatabase();try{
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'tech@example.invalid',now()),($2,'other@example.invalid',now())",[user,other]);
 await db.exec("set role service_role");
 const first=(await db.query<any>("select register_partner_self($1,'tech@example.invalid',$2) id",[user,JSON.stringify(profile)])).rows[0].id;
 assert.equal((await db.query<any>("select register_partner_self($1,'tech@example.invalid',$2) id",[user,JSON.stringify(profile)])).rows[0].id,first);
 const state=(await db.query<any>("select partner_onboarding_status($1,'tech@example.invalid') state",[user])).rows[0].state;assert.equal(state.registered,true);assert.equal(state.partner.id,first);
 await db.exec("reset role");
 assert.equal((await db.query<any>("select count(*)::int n from partner_users where user_id=$1",[user])).rows[0].n,1);
 assert.equal((await db.query<any>("select count(*)::int n from partner_access_history where user_id=$1",[user])).rows[0].n,1);
 assert.equal((await db.query<any>("select count(*)::int n from partner_departments where partner_id=$1",[first])).rows[0].n,2);
 for(const table of ["diagnostics","lead_purchases","partner_subscriptions","partner_charter_acceptances"]){assert.equal((await db.query<any>(`select count(*)::int n from ${table}`)).rows[0].n,0);}
 await db.query("update partner_users set active=false where user_id=$1",[user]);
 await assert.rejects(db.query("select register_partner_self($1,'tech@example.invalid',$2)",[user,JSON.stringify(profile)]),/PARTNER_ACCESS_INACTIVE/);
 await db.exec("set role authenticated");await assert.rejects(db.query("select register_partner_self($1,'tech@example.invalid',$2)",[user,JSON.stringify(profile)]),/permission denied/);
 }finally{await db.close();}
});
test("confirmed email can claim only its unused pre-created company; existing or disabled memberships cannot be taken over",async()=>{
 const db=await fullDatabase();try{
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'tech@example.invalid',now()),($2,'other@example.invalid',now()),($3,'third@example.invalid',now())",[user,other,third]);
 const company=(await db.query<any>("insert into partners(company_name,email) values('Entreprise préinscrite TEST','Tech@Example.invalid') returning id")).rows[0].id;
 let status=(await db.query<any>("select partner_onboarding_status($1,'tech@example.invalid') state",[user])).rows[0].state;assert.equal(status.candidate.company_name,"Entreprise préinscrite TEST");
 assert.equal((await db.query<any>("select partner_onboarding_status($1,'other@example.invalid') state",[other])).rows[0].state.candidate,null);
 await assert.rejects(db.query("select register_partner_self($1,'tech@example.invalid',$2)",[user,JSON.stringify(profile)]),/EXISTING_COMPANY_CONFIRMATION_REQUIRED/);
 await assert.rejects(db.query("select register_partner_self($1,'other@example.invalid',$2)",[other,JSON.stringify({...profile,mode:"claim"})]),/COMPANY_NOT_FOUND/);
 await db.exec("set role service_role");assert.equal((await db.query<any>("select register_partner_self($1,'tech@example.invalid',$2) id",[user,JSON.stringify({...profile,mode:"claim"})])).rows[0].id,company);await db.exec("reset role");
 await db.query("update partner_users set active=false where user_id=$1",[user]);
 await assert.rejects(db.query("select register_partner_self($1,'tech@example.invalid',$2)",[third,JSON.stringify({...profile,mode:"claim"})]),/PARTNER_ACCESS_INACTIVE/);
 status=(await db.query<any>("select partner_onboarding_status($1,'tech@example.invalid') state",[third])).rows[0].state;assert.equal(status.blocked,true);
 }finally{await db.close();}
});
test("registration API derives identity and email from the verified session; free billing endpoints never call Stripe, including portals",async()=>{
 const original=globalThis.fetch,env={...process.env},db="https://db.fixture.invalid",app="https://app.fixture.invalid";
 Object.assign(process.env,{NEXT_PUBLIC_APP_URL:app,NEXT_PUBLIC_SUPABASE_URL:db,SUPABASE_SERVICE_ROLE_KEY:"fixture",NEXT_PUBLIC_SANISPA_BILLING_MODE:"free"});
 const jwt=`e30.${Buffer.from(JSON.stringify({sub:user,role:"authenticated",session_id:"60000000-0000-4000-8000-000000000010",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")}.fixture`;
 let unconfirmed=false;const calls:any[]=[];
 const request=(payload:unknown,path="/api/partner/registration")=>new Request(app+path,{method:"POST",headers:{Authorization:`Bearer ${jwt}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):{};assert.equal(u.origin,db,"No external payment calls");calls.push({path:u.pathname,body});
  if(u.pathname==="/auth/v1/user")return Response.json({id:user,email:"Tech@Example.invalid",email_confirmed_at:unconfirmed?null:"2026-11-19",app_metadata:{}});
  if(u.pathname.endsWith("/rpc/private_session_status"))return Response.json({active:true,is_admin:false,mfa_verified:false});
  if(u.pathname.endsWith("/rpc/consume_request_limit"))return Response.json(true);
  if(u.pathname.endsWith("/rpc/register_partner_self")){assert.equal(body.p_user,user);assert.equal(body.p_email,"tech@example.invalid");return Response.json(other);}
  if(u.pathname.endsWith("/rpc/partner_onboarding_status"))return Response.json({registered:false});
  if(u.pathname.endsWith("/partner_users"))return Response.json([{role:"owner",active:true,partners:{id:other,active:true,company_name:"TEST",leads_paid:true}}]);
  throw new Error(`Unexpected ${u.pathname}`);
 };
 try{
  assert.equal((await POST(request(profile))).status,200);
  assert.equal((await POST(request({...profile,userId:other}))).status,400);
  assert.equal((await POST(request({mode:"claim",partnerId:other}))).status,400);
  assert.equal((await GET(new Request(app+"/api/partner/registration",{headers:{Authorization:`Bearer ${jwt}`}}))).status,200);
  unconfirmed=true;assert.equal((await POST(request(profile))).status,401);unconfirmed=false;
  for(const action of ["subscribe","portal"]){const r=await customerBilling(request({action},"/api/client/premium"));assert.equal(r.status,200);assert.equal((await r.json()).complimentary,true);const p=await partnerBilling(request(action==="subscribe"?{action,plan:"management"}:{action},"/api/partner/subscription"));assert.equal(p.status,200);assert.equal((await p.json()).complimentary,true);}
  assert.ok(!calls.some(c=>/subscription_checkouts|customer_subscriptions|partner_subscriptions/.test(c.path)));
  assert.equal(new URL(clientTokenConfirmationUrl(app,"a".repeat(64),"partenaire")).searchParams.get("next"),"partenaire");
  assert.equal(partnerRegistrationSchema.safeParse({...profile,active:true}).success,false);
 }finally{globalThis.fetch=original;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
test("complete coordinates and SIRET are required, and only administrator review unlocks the first dossier",async()=>{
 const db=await fullDatabase();try{
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'tech@example.invalid',now()),($2,'admin@example.invalid',now())",[user,other]);await db.query("insert into admin_users(user_id,active) values($1,true)",[other]);
 await assert.rejects(db.query("select register_partner_self($1,'tech@example.invalid',$2)",[user,JSON.stringify({...profile,siret:undefined})]),/INVALID_REGISTRATION/);
 assert.equal((await db.query<any>("select count(*)::int n from partners")).rows[0].n,0);
 await db.exec("set role service_role");const id=(await db.query<any>("select register_partner_self($1,'tech@example.invalid',$2) id",[user,JSON.stringify(profile)])).rows[0].id;await db.exec("reset role");
 const p=(await db.query<any>("select siret,address,verification_status,verified_at from partners where id=$1",[id])).rows[0];assert.equal(p.siret,profile.siret);assert.equal(p.address,profile.address);assert.equal(p.verification_status,"pending");assert.equal(p.verified_at,null);
 const customer=(await db.query<any>("insert into customers(name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values('TEST','0000000000','client@example.invalid','TEST','TEST','2020','exterieur','230V') returning id")).rows[0].id;
 const diagnostic=(await db.query<any>("insert into diagnostics(customer_id,problem_type,choice,department,request_type,status) values($1,'fuite','intervention','67','TECHNICAL_REQUEST','NEW') returning id",[customer])).rows[0].id;
 const publish=()=>db.query("select publish_partner_offer($1,$2,$3,'fuite','Fuite visible au niveau du raccord du spa','{}')",[diagnostic,id,other]);
 await assert.rejects(publish(),/PARTNER_VERIFICATION_REQUIRED/);assert.equal((await db.query<any>("select count(*)::int n from notification_jobs")).rows[0].n,0);
 await assert.rejects(db.query("select verify_partner_registration($1,$2)",[id,user]),/ADMIN_REQUIRED/);
 await db.exec("set role authenticated");await assert.rejects(db.query("select verify_partner_registration($1,$2)",[id,other]),/permission denied/);await db.exec("reset role");
 await db.exec("set role service_role");await db.query("select verify_partner_registration($1,$2)",[id,other]);await db.exec("reset role");await publish();
 const approved=(await db.query<any>("select verification_status,verified_by,verified_at from partners where id=$1",[id])).rows[0];assert.equal(approved.verification_status,"verified");assert.equal(approved.verified_by,other);assert.ok(approved.verified_at);assert.equal((await db.query<any>("select count(*)::int n from notification_jobs")).rows[0].n,1);
 }finally{await db.close();}
});
