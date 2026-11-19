import { NextResponse } from "next/server";
import { requireUser, rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { partnerRegistrationSchema } from "@/lib/partner-registration";
import { needsPartnerPasswordChange } from "@/lib/partner-navigation";
export async function GET(request:Request){
 try{
  const {user,supabase}=await requireUser(request);
  const result=await supabase.rpc("partner_onboarding_status",{p_user:user.id,p_email:user.email!.toLowerCase()});
  if(result.error)throw result.error;
  return NextResponse.json({...result.data,passwordChangeRequired:needsPartnerPasswordChange(user)},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return apiError(e);}
}
export async function POST(request:Request){
 try{
  const {user,supabase}=await requireUser(request);
  await rateLimit(supabase,`partner-register:${user.id}`,6,3600);
  const payload=partnerRegistrationSchema.parse(await readJson(request,10000));
  const result=await supabase.rpc("register_partner_self",{p_user:user.id,p_email:user.email!.toLowerCase(),p_profile:payload});
  if(result.error){
   const code=result.error.message;
   if(/PARTNER_ACCESS_INACTIVE|PARTNER_EMAIL_AMBIGUOUS|MULTIPLE_COMPANIES/.test(code))throw new HttpError(409,"Votre entreprise dispose déjà d’un accès ou est désactivée. Contactez SANISPA pour vérifier votre rattachement.");
   if(/EXISTING_COMPANY_CONFIRMATION_REQUIRED|COMPANY_NOT_FOUND/.test(code))throw new HttpError(409,"Les informations d’inscription ont changé. Actualisez cette page avant de poursuivre.");
   throw result.error;
  }
  return NextResponse.json({ok:true,partnerId:result.data},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return apiError(e);}
}
