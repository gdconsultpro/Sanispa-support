import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/client/register/route";
import { POST as claimDraft } from "../app/api/client/drafts/route";
import { emptyDraft } from "../lib/storage";
const app="https://support.sani-spa.fr",db="https://db.fixture.invalid",token="b".repeat(64),password="Une phrase de test 2026";
const user = "40000000-0000-4000-8000-000000000002";
const id = "40000000-0000-4000-8000-000000000003";
const payload = {
  ...emptyDraft, email: "wrong@example.invalid", problemType: "fuite", name: "Client fictif",
  spaBrand: "Spa fictif", phone: "0001234567",
  answers: { visible_leak: "Oui" }, photos: { overview: "data:image/png;base64,ZmFrZQ==" },
};
const request=(body:unknown,origin=app)=>new Request(app+"/api/client/register",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","x-vercel-forwarded-for":"192.0.2.2"},body:JSON.stringify(body)});
async function fixture(run:(s:any)=>Promise<void>){
 const previousFetch=globalThis.fetch,env={...process.env};
 Object.assign(process.env,{NEXT_PUBLIC_APP_URL:app,NEXT_PUBLIC_SUPABASE_URL:db,SUPABASE_SERVICE_ROLE_KEY:"fixture",RESEND_API_KEY:"fixture",EMAIL_PROVIDER:"resend",EMAIL_FROM:"SANISPA <test@example.invalid>"});
 const s={calls:[] as any[],sent:[] as any[],limited:false,authError:"",confirmed:false,banned:false,deliveryError:false,storageError:false};
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input)),body=JSON.parse(String(init?.body||"{}"));s.calls.push({path:u.pathname,body});
  if(u.origin===db&&u.pathname.endsWith("/rpc/consume_request_limit"))return Response.json(!s.limited);
  if (u.origin === db && u.pathname === "/rest/v1/client_signup_drafts")
   return s.storageError ? Response.json({ message: "Unavailable" }, { status: 503 }) : new Response(null, { status: 201 });
  if (u.origin === db && u.pathname === "/auth/v1/user")
   return Response.json({ id: user, email: "client@example.invalid", email_confirmed_at: s.confirmed ? "2026-11-21" : null });
  if (u.origin === db && u.pathname.endsWith("/rpc/private_session_status"))
   return Response.json({ active: true });
  if (u.origin === db && u.pathname.endsWith("/rpc/claim_client_signup_draft"))
   return Response.json({ id, step: "/questionnaire", version: 1, payload });
  if(u.origin===db&&u.pathname==="/auth/v1/admin/generate_link"){
   if(s.authError)return Response.json({error_code:s.authError,msg:"Auth rejected"},{status:422});
   return Response.json({id:user,email:body.email,hashed_token:token,email_otp:"123456",verification_type:"signup",email_confirmed_at:s.confirmed?"2026-01-01":undefined,banned_until:s.banned?"2099-01-01":undefined});
  }
  if(u.origin==="https://api.resend.com"&&u.pathname==="/emails"){s.sent.push(body);return s.deliveryError?Response.json({message:"Unavailable"},{status:503}):Response.json({id:"fixture-signup"});}
  throw new Error("Unexpected request "+u.pathname);
 };
 try{await run(s);}finally{globalThis.fetch=previousFetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
}
test("one password signup sends one confirmation, creates no browser session, and keeps credentials out of its response and e-mail",()=>fixture(async s=>{
 const r=await POST(request({email:" Client@Example.invalid ",password,next:"diagnostic",problemType:"fuite"}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(r.headers.get("set-cookie"),null);
 const auth=s.calls.find((c:any)=>c.path.endsWith("generate_link"));assert.deepEqual(auth.body,{type:"signup",email:"client@example.invalid",password,data:{sanispa_signup_audience:"customer"}});assert.equal(s.calls.filter((c:any)=>c.path.endsWith("generate_link")).length,1);assert.equal(s.sent.length,1);
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
test("partner signup directs an existing customer to reuse their account without a new confirmation",()=>fixture(async s=>{
 s.authError="user_already_exists";
 const response=await POST(request({email:"existing@example.invalid",password,next:"partenaire"}));
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,"ACCOUNT_EXISTS");
 assert.equal(s.sent.length,0);
}));
test("rate limits stop signup and failed delivery does not report success",()=>fixture(async s=>{
 s.limited=true;assert.equal((await POST(request({email:"client@example.invalid",password,next:"compte"}))).status,429);assert.equal(s.calls.length,1);assert.equal(s.sent.length,0);
 s.limited=false;s.deliveryError=true;assert.equal((await POST(request({email:"tech@example.invalid",password,next:"partenaire"}))).status,503);assert.equal(s.sent.length,1);
}));
test("signup persists the draft for the Auth user before sending an opaque link", () => fixture(async s => {
  const registration = { email: "Client@Example.invalid", password, next: "diagnostic", draft: { id, step: "/questionnaire", payload } };
  s.storageError = true;
  assert.equal((await POST(request(registration))).status, 503);
  assert.equal(s.sent.length, 0);
  s.storageError = false;
  assert.equal((await POST(request(registration))).status, 200);
  const stored = s.calls.find((c: { path: string }) => c.path.endsWith("/client_signup_drafts")).body;
  assert.equal(stored.user_id, user);
  assert.equal(stored.step, "/questionnaire");
  assert.deepEqual(stored.payload, { ...payload, email: "client@example.invalid" });
  assert.match(s.sent[0].html, new RegExp("draft=" + id + "#token_hash=" + token));
  assert.ok(!s.sent[0].html.includes(payload.name));
  assert.ok(!s.sent[0].html.includes(payload.phone));
  assert.equal((await POST(request({ ...registration, next: "partenaire" }))).status, 400);
  assert.equal((await POST(request({ ...registration, draft: { ...registration.draft, payload: { ...payload, spaId: id } } }))).status, 400);
}));
test("only an authenticated and confirmed session can claim a signup draft", () => fixture(async s => {
  const jwt = "e30." + Buffer.from(JSON.stringify({
    sub: user, role: "authenticated", session_id: id, exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url") + ".fixture";
  const claim = (body = { id }) => new Request(app + "/api/client/drafts", {
    method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body),
  });
  assert.equal((await claimDraft(claim())).status, 401);
  assert.equal(s.calls.length, 1);
  s.confirmed = true;
  assert.equal((await claimDraft(claim({ id: "malformed" }))).status, 400);
  const result = await claimDraft(claim());
  assert.equal(result.status, 200);
  assert.deepEqual(s.calls.filter((c: { path: string }) => c.path.endsWith("/claim_client_signup_draft")).map((c: { body: unknown }) => c.body), [{ p_id: id, p_user: user }]);
}));
