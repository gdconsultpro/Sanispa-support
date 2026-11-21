import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/client-auth";
import { clientTokenConfirmationUrl } from "@/lib/client-access";
import { sendClientAccessLink } from "@/lib/email";
import { apiError, HttpError, readJson } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";
const schema=z.object({email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(12).max(128),next:z.enum(["compte","diagnostic","partenaire","premium","visio","carnet","releves","notices","assistant","forum"]),problemType:z.string().max(60).optional()}).strict();
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function POST(request:Request){
 try{
  requireSameOrigin(request);
  const p=schema.parse(await readJson(request,2000));
  const origin=process.env.NEXT_PUBLIC_APP_URL;
  if(!origin||!process.env.RESEND_API_KEY)throw new HttpError(503,"La création de compte est momentanément indisponible.");
  const supabase=getSupabaseAdmin();
  const ip=(request.headers.get("x-vercel-forwarded-for")||request.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,120);
  await rateLimit(supabase,"access:global",200,3600);
  await rateLimit(supabase,`access:ip:${hash(ip)}`,20,3600);
  await rateLimit(supabase,`access:email:${hash(p.email)}`,6,3600);
  await rateLimit(supabase,`access:cooldown:${hash(p.email)}`,1,60);
  // Auth hashes the password. generateLink(signup) never replaces a password
  // on an existing account, and creates no authenticated browser session.
  const generated=await supabase.auth.admin.generateLink({type:"signup",email:p.email,password:p.password});
  if(generated.error){
   if(["email_exists","user_already_exists"].includes(generated.error.code||""))throw new HttpError(409,"Cette adresse possède déjà un compte. Connectez-vous ou utilisez « Mot de passe oublié » pour créer ou retrouver votre mot de passe.");
   if(generated.error.code==="weak_password")throw new HttpError(400,"Choisissez un mot de passe plus long et unique, d’au moins 12 caractères.");
   throw new HttpError(503,"Le compte n’a pas pu être créé. Réessayez dans une minute.");
  }
  const user=generated.data.user,token=generated.data.properties?.hashed_token;
  if(!user||user.email_confirmed_at||(user.banned_until&&Date.parse(user.banned_until)>Date.now()))throw new HttpError(409,"Utilisez la connexion ou « Mot de passe oublié » pour accéder à votre compte existant.");
  if(!token||!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw new Error("Invalid signup confirmation");
  const url=clientTokenConfirmationUrl(origin,token,p.next,p.problemType);
  const delivery=await sendClientAccessLink(p.email,url,false,`signup:${hash(token)}`,true);
  if(delivery.skipped)throw new HttpError(503,"L’envoi du mail n’a pas abouti. Réessayez dans une minute pour recevoir la confirmation.");
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return apiError(e);}
}
