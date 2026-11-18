import { test } from "node:test";
import assert from "node:assert/strict";
import { GET,POST } from "../app/api/client/moving-media/route";
import { GET as document } from "../app/api/client/documents/[id]/route";
import { GET as manuals } from "../app/api/client/manuals/route";
const uid="30000000-0000-4000-8000-000000000001",draftId="30000000-0000-4000-8000-000000000010",id="30000000-0000-4000-8000-000000000020",base="https://db.fixture.invalid",app="https://app.fixture.invalid";
const jwt=`e30.${Buffer.from(JSON.stringify({sub:uid,session_id:"30000000-0000-4000-8000-000000000030",role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")}.fixture`;
const req=(body?:unknown)=>new Request(`${app}/api/client/moving-media${body?'':`?draftId=${draftId}`}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${jwt}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
test("video API rejects foreign dossiers, over-limit uploads and spoofed files, and delivers private videos without proxying their bytes",async()=>{
 const fetch=globalThis.fetch,env={...process.env};Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:"fixture",NEXT_PUBLIC_SANISPA_BILLING_MODE:"live"});
 let owner=true,full=false,badSize=false,badVideo=false,finalized=0,storageCalls=0,media={id,draft_id:draftId,user_id:uid,storage_path:`${uid}/${draftId}/${id}.mp4`,file_name:"acces.mp4",mime_type:"video/mp4",file_size:1024,document_id:null as string|null};
 globalThis.fetch=async(input,init)=>{
  const u=new URL(String(input));assert.equal(u.origin,base,"No production or third-party requests");const body=init?.body?JSON.parse(String(init.body)):{};
  if(u.pathname==="/auth/v1/user")return Response.json({id:uid,email:"client@example.invalid",email_confirmed_at:"2026-11-18"});
  if(u.pathname.endsWith("/rpc/private_session_status"))return Response.json({active:true,is_admin:false,mfa_verified:false});
  if(u.pathname.endsWith("/rpc/consume_request_limit"))return Response.json(true);
  if(u.pathname.endsWith("/rpc/customer_has_premium"))return Response.json(true);
  if(u.pathname.endsWith("/customer_subscriptions"))return Response.json({status:"active",paid_until:"2099-01-01"});
  if(u.pathname.endsWith("/diagnostic_drafts")){assert.equal(u.searchParams.get("user_id"),`eq.${uid}`);return Response.json(owner?{id:draftId,payload:{problemType:"demenagement"},submitted_at:null}:null);}
  if(u.pathname.endsWith("/moving_media_uploads")){
   if(init?.method==="POST"){media={...media,...body};return new Response(null,{status:204});}
   return Response.json(u.searchParams.has("id")?media:full?[{slot:0},{slot:1},{slot:2}]:[]);
  }
  if(u.pathname.endsWith("/rpc/complete_moving_media_upload")){assert.equal(body.p_user,uid);finalized++;return Response.json(media.id);}
  if(u.pathname.endsWith("/spa_manuals")){assert.equal(u.searchParams.get("language"),"eq.fr");return Response.json([]);}
  if(u.pathname.endsWith("/client_documents")){assert.equal(u.searchParams.get("user_id"),`eq.${uid}`);return Response.json({...media,storage_bucket:"moving-videos"});}
  if(u.pathname.includes("/storage/")){
   storageCalls++;
   if(u.pathname.includes('/object/upload/sign/'))return Response.json({url:`/object/upload/sign/moving-videos/${media.storage_path}?token=fixture-token`});
   if(u.pathname.includes('/object/info/'))return Response.json({size:badSize?999:1024,content_type:"video/mp4"});
   if(u.pathname.includes('/object/sign/'))return Response.json({signedURL:`/object/sign/moving-videos/${media.storage_path}?token=read-fixture`});
   if(u.pathname.includes('/object/sign/'))throw new Error('unreachable');
  }
  throw new Error(`Unexpected ${u.pathname}`);
 };
 // Signed object URL GET shares its pathname with the sign-creation POST.
 const mocked=globalThis.fetch;globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.searchParams.get("token")==="read-fixture"&&(!init?.method||init.method==="GET")){assert.equal(init?.headers && (init.headers as Record<string,string>).Range,"bytes=0-63");return new Response(badVideo?Buffer.from("<html>bad file</html>"):Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109]),{status:206});}return mocked(input,init);};
 try{
  const p={draftId,action:"prepare",name:"acces.mp4",mime:"video/mp4",size:1024};
  assert.equal((await GET(new Request(`${app}/api/client/moving-media?draftId=${draftId}`))).status,401);
  owner=false;assert.equal((await POST(req(p))).status,404);assert.equal(storageCalls,0);owner=true;
  assert.equal((await POST(req({...p,size:31*1024*1024}))).status,400);assert.equal((await POST(req({...p,mime:"text/html"}))).status,400);
  full=true;assert.equal((await POST(req(p))).status,409);full=false;
  const signed=await POST(req(p));assert.equal(signed.status,200);assert.equal((await signed.json()).token,"fixture-token");
  badSize=true;assert.equal((await POST(req({draftId,action:"complete",id:media.id}))).status,400);assert.equal(finalized,0);badSize=false;
  badVideo=true;assert.equal((await POST(req({draftId,action:"complete",id:media.id}))).status,400);assert.equal(finalized,0);badVideo=false;
  assert.equal((await POST(req({draftId,action:"complete",id:media.id}))).status,200);assert.equal(finalized,1);
  const download=await document(new Request(app+`/api/client/documents/${media.id}`,{headers:{Authorization:`Bearer ${jwt}`}}),{params:Promise.resolve({id:media.id})});assert.equal(download.status,303);assert.equal(download.headers.get("cache-control"),"private, no-store");
  assert.equal((await manuals(new Request(app+"/api/client/manuals",{headers:{Authorization:`Bearer ${jwt}`}}))).status,200);
 }finally{globalThis.fetch=fetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
