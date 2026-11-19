import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/client/register/route";
const app="https://support.sani-spa.fr",db="https://db.fixture.invalid",token="b".repeat(64),password="Une phrase de test 2026";
const request=(body:unknown,origin=app)=>new Request(app+"/api/client/register",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","x-vercel-forwarded-for":"192.0.2.2"},body:JSON.stringify(body)});
async function fixture(run:(s:any)=>Promise<void>){
 const previousFetch=globalThis.fetch,env={...process.env};
 Object.assign(process.env,{NEXT_PUBLIC_APP_URL:app,NEXT_PUBLIC_SUPABASE_URL:db,SUPABASE_SERVICE_ROLE_KEY:"fixture",RESEND_API_KEY:"fixture",EMAIL_PROVIDER:"resend",EMAIL_FROM:"SANISPA <test@example.invalid>"});
 const s={calls:[] as any[],sent:[] as any[],limited:false,authError:"",confirmed:false,banned:false,deliveryError:false};
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input)),body=JSON.parse(String(init?.body||"{}"));s.calls.push({path:u.pathname,body});
  if(u.origin===db&&u.pathname.endsWith("/rpc/consume_request_limit"))return Response.json(!s.limited);
  if(u.origin===db&&u.pathname==="/auth/v1/admin/generate_link"){
   if(s.authError)return Response.json({error_code:s.authError,msg:"Auth rejected"},{status:422});
   return Response.json({id:"40000000-0000-4000-8000-000000000002",email:body.email,hashed_token:token,email_otp:"123456",verification_type:"signup",email_confirmed_at:s.confirmed?"2026-01-01":undefined,banned_until:s.banned?"2099-01-01":undefined});
  }
  if(u.origin==="https://api.resend.com"&&u.pathname==="/emails"){s.sent.push(body);return s.deliveryError?Response.json({message:"Unavailable"},{status:503}):Response.json({id:"fixture-signup"});}
  throw new Error("Unexpected request "+u.pathname);
 };
 try{await run(s);}finally{globalThis.fetch=previousFetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
}
test("one password signup sends one confirmation, creates no browser session, and keeps credentials out of its response and e-mail",()=>fixture(async s=>{
 const r=await POST(request({email:" Client@Example.invalid ",password,next:"diagnostic",problemType:"fuite"}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(r.headers.get("set-cookie"),null);
 const auth=s.calls.find((c:any)=>c.path.endsWith("generate_link"));assert.deepEqual(auth.body,{type:"signup",email:"client@example.invalid",password});assert.equal(s.calls.filter((c:any)=>c.path.endsWith("generate_link")).length,1);assert.equal(s.sent.length,1);
 assert.equal(s.sent[0].subject,"SANISPA Support — Confirmation de création de compte");assert.ok(s.sent[0].html.includes(app+"/auth/retour?next=diagnostic"));assert.ok(s.sent[0].html.includes("#token_hash="+token));assert.ok(!JSON.stringify(s.sent).includes(password));assert.ok(!s.calls.some((c:any)=>c.path.includes("/token")));
 assert.ok(s.calls.filter((c:any)=>c.path.endsWith("consume_request_limit")).every((c:any)=>!JSON.stringify(c.body).includes(password)&&!JSON.stringify(c.body).includes("client@example.invalid")));
}));
test("signup validates origin, password and redirect before accessing Auth",()=>fixture(async s=>{
 for(const [body,origin,code] of [[{email:"x@example.invalid",password,next:"compte"},"https://evil.invalid",403],[{email:"x@example.invalid",password:"short",next:"compte"},app,400],[{email:"x@example.invalid",password,next:"https://evil.invalid"},app,400],[{email:"x@example.invalid",password,next:"admin"},app,400],[{email:"x@example.invalid",password,next:"partenaire",userId:"forged"},app,400]] as const)assert.equal((await POST(request(body,origin))).status,code);
 assert.equal(s.calls.length,0);
}));
test("existing or blocked accounts cannot be overwritten or receive a signup session",()=>fixture(async s=>{
 for(const code of ["email_exists","user_already_exists"]){s.authError=code;assert.equal((await POST(request({email:"existing@example.invalid",password,next:"compte"}))).status,409);}
 s.authError="";s.confirmed=true;assert.equal((await POST(request({email:"existing@example.invalid",password,next:"compte"}))).status,409);s.confirmed=false;s.banned=true;assert.equal((await POST(request({email:"blocked@example.invalid",password,next:"partenaire"}))).status,409);
 assert.equal(s.sent.length,0);assert.ok(s.calls.every((c:any)=>c.path.endsWith("generate_link")||c.path.endsWith("consume_request_limit")));
}));
test("rate limits stop signup and failed delivery does not report success",()=>fixture(async s=>{
 s.limited=true;assert.equal((await POST(request({email:"client@example.invalid",password,next:"compte"}))).status,429);assert.equal(s.calls.length,1);assert.equal(s.sent.length,0);
 s.limited=false;s.deliveryError=true;assert.equal((await POST(request({email:"tech@example.invalid",password,next:"partenaire"}))).status,503);assert.equal(s.sent.length,1);
}));
