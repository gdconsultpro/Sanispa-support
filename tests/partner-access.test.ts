import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createPartnerAccess, partnerAccessSchema } from "../lib/partner-access";
import { partnerReturnPath, needsPartnerPasswordChange, withPartnerTimeout } from "../lib/partner-navigation";
import { canViewPartnerOffer } from "../lib/partner-release";
import { buildPartnerLeadEmail, sendPartnerLeadNotification } from "../lib/email";
const id="00000000-0000-4000-8000-000000000001";
const partnerId="00000000-0000-4000-8000-000000000002";
const user={id,email:"fictif@example.invalid",email_confirmed_at:"2026-09-11T10:00:00Z",app_metadata:{partner_password_change_required:true}};
const input={mode:"create" as const,name:"Contact fictif",email:user.email,password:"Fictitious-only-901!"};
async function fixture(run:(s:any)=>Promise<void>){
 const state={existing:false,linkError:null as string|null,created:0,linked:0,lastCreate:null as any};
 const client=createClient("https://test-partner.invalid","mock-only",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
  const u=new URL(String(url)); assert.equal(u.origin,"https://test-partner.invalid");
  if(u.pathname==="/rest/v1/partners") return Response.json({id:partnerId,active:true});
  if(u.pathname==="/auth/v1/admin/users" && (!options?.method || options.method==="GET")) return Response.json({users:state.existing?[user]:[],aud:"authenticated"});
  if(u.pathname==="/auth/v1/admin/users" && options?.method==="POST") {state.created++;state.lastCreate=JSON.parse(String(options.body));return Response.json(user);}
  if(u.pathname==="/rest/v1/rpc/link_partner_account"){state.linked++;const body=JSON.parse(String(options?.body));assert(!JSON.stringify(body).includes(input.password));return state.linkError?Response.json({message:state.linkError,code:"P0001"},{status:400}):Response.json(id);}
  throw new Error(`Unexpected transport ${u.pathname}`);
 }}});
 await run({state,client});
}
test("new partner Auth account is confirmed, forced to change, and linked before ready",()=>fixture(async({state,client})=>{
 const result=await createPartnerAccess(client,partnerId,id,input);assert.equal(result.ready,true);assert.equal(state.created,1);assert.equal(state.linked,1);assert.equal(state.lastCreate.email_confirm,true);assert.equal(state.lastCreate.app_metadata.partner_password_change_required,true);assert(!JSON.stringify(result).includes(input.password));
}));
test("existing account requires explicit confirmation and preserves its password",()=>fixture(async({state,client})=>{
 state.existing=true;const result=await createPartnerAccess(client,partnerId,id,input);assert.equal(result.conflict,true);assert.equal(state.created,0);assert.equal(state.linked,0);
 const linked=await createPartnerAccess(client,partnerId,id,{mode:"link",name:input.name,email:input.email,existingUserId:id,reactivate:false});assert.equal(linked.ready,true);assert.equal(state.created,0);assert.equal(state.linked,1);
}));
test("partial creation is never reported ready; other-company linking refuses",()=>fixture(async({state,client})=>{
 state.linkError="ACCOUNT_LINKED_ELSEWHERE";
 await assert.rejects(createPartnerAccess(client,partnerId,id,input),/créé, mais l’accès partenaire n’est pas prêt/);
}));
test("forged existing identity is rejected before linking",()=>fixture(async({state,client})=>{
 state.existing=true;await assert.rejects(createPartnerAccess(client,partnerId,id,{mode:"link",name:input.name,email:input.email,existingUserId:partnerId,reactivate:false}),/a changé/);assert.equal(state.linked,0);
}));
test("account schema rejects weak credentials and unexpected permission fields",()=>{
 assert.equal(partnerAccessSchema.safeParse({...input,password:"short"}).success,false);
 assert.equal(partnerAccessSchema.safeParse({...input,role:"admin"}).success,false);
});
test("only validated internal destinations survive login and password replacement",()=>{
 const path=`/partenaire/leads/${id}`;assert.equal(partnerReturnPath(path),path);
 for(const invalid of ["//evil.example","https://evil.example","/partenaire/connexion?next=evil","/admin","/partenaire/leads/%2f%2fevil","/partenaire/leads/../admin",`${path}?next=https://evil.example`]) assert.equal(partnerReturnPath(invalid),"/partenaire/leads");
});
test("client-editable metadata never clears the first-password requirement",()=>{
 assert.equal(needsPartnerPasswordChange({app_metadata:{partner_password_change_required:true}}),true);
 assert.equal(needsPartnerPasswordChange({app_metadata:{}}),false);
});
test("a stalled authentication operation returns a useful error",async()=>{
 await assert.rejects(withPartnerTimeout(new Promise(()=>{}),5),/trop de temps/);
});
test("home intervention requires manual approval and exact selected partner; old reservations retained",()=>{
 const row={choice:"intervention",matched_partner_ids:[partnerId],partner_released_at:null};
 assert.equal(canViewPartnerOffer(row,partnerId),false);assert.equal(canViewPartnerOffer(row,partnerId,true),true);
 assert.equal(canViewPartnerOffer({...row,partner_released_at:"2026-09-11"},partnerId),true);
 assert.equal(canViewPartnerOffer({...row,partner_released_at:"2026-09-11"},id),false);
});
test("partner notification includes escaped button and fallback with current environment domain",()=>{
 const before=process.env.NEXT_PUBLIC_APP_URL;process.env.NEXT_PUBLIC_APP_URL="https://recipe.example.invalid";
 try{const html=buildPartnerLeadEmail({diagnosticId:id,partners:[],problemType:"pompe",postalCode:"67000",city:"TEST",department:"67",answers:[]},{id:partnerId,companyName:"Fictif <test>",email:input.email});
 assert(html.includes(`href="https://recipe.example.invalid/partenaire/leads/${id}"`));assert(html.includes("Consulter la demande"));assert(html.includes('href="https://recipe.example.invalid/partenaire"'));assert(html.includes("Fictif &lt;test&gt;"));assert(!html.includes(input.password));
 }finally{if(before===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=before;}
});

test("notification sender uses the simulated transport and exposes no credentials",async()=>{
 const fetchBefore=globalThis.fetch;const keys=["NEXT_PUBLIC_APP_URL","EMAIL_PROVIDER","RESEND_API_KEY"];const before=keys.map(k=>process.env[k]);
 Object.assign(process.env,{NEXT_PUBLIC_APP_URL:"https://recipe.example.invalid",EMAIL_PROVIDER:"resend",RESEND_API_KEY:"simulated-not-a-key"});
 const requests:any[]=[];
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),"https://api.resend.com/emails");requests.push(JSON.parse(String(options?.body)));return Response.json({id:"simulated-only"});};
 try{const result=await sendPartnerLeadNotification({diagnosticId:id,partners:[{id:partnerId,companyName:"TEST",email:"test@example.invalid"}],problemType:"pompe",department:"67",postalCode:"",city:"",answers:[]});
 assert.equal(result.sent,1);assert.equal(requests.length,1);assert(requests[0].html.includes("Consulter la demande"));assert(!requests[0].html.includes(input.password));
 }finally{globalThis.fetch=fetchBefore;keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];});}
});
