import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { processNotifications } from "@/lib/notifications";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{id:string}> };
export async function GET(request: Request, {params}: Context) {
  try {
    const {supabase} = await administrator(request.headers);
    const id = z.string().uuid().parse((await params).id);
    const {data:d,error} = await supabase.from("diagnostics").select("department,partner_released_at,matched_partner_ids,assigned_partner_id").eq("id",id).single();
    if(error) throw error;
    const {data:rows,error:partnerError} = await supabase.from("partner_departments").select("partners!inner(id,company_name,active)").eq("department",d.department).eq("partners.active",true);
    if(partnerError) throw partnerError;
    return NextResponse.json({releasedAt:d.partner_released_at,selected:d.matched_partner_ids,assigned:Boolean(d.assigned_partner_id),partners:(rows??[]).map((r:any)=>Array.isArray(r.partners)?r.partners[0]:r.partners)}, {headers});
  } catch(error) {return apiError(error);}
}
export async function POST(request: Request, {params}: Context) {
  try {
    const {supabase,user} = await administrator(request.headers); requireSameOrigin(request);
    const id = z.string().uuid().parse((await params).id);
    const {partnerId} = z.object({partnerId:z.string().uuid()}).strict().parse(await readJson(request,1024));
    const {data:d,error} = await supabase.from("diagnostics").select("id,problem_type,department,customers(spa_brand,spa_model)").eq("id",id).single();
    if(error) throw error;
    const {data:p,error:partnerError} = await supabase.from("partners").select("id,company_name,contact_name,email").eq("id",partnerId).single();
    if(partnerError) throw partnerError;
    const customer = (Array.isArray(d.customers)?d.customers[0]:d.customers) as any;
    const job = {diagnosticId:id,partners:[{id:p.id,companyName:p.company_name,contactName:p.contact_name,email:p.email}],problemType:d.problem_type,department:d.department,postalCode:"",city:"",spaBrand:customer?.spa_brand,spaModel:customer?.spa_model,answers:[]};
    const result = await supabase.rpc("release_partner_intervention",{p_diagnostic:id,p_partner:partnerId,p_actor:user.id,p_job:job});
    if(result.error) throw new HttpError(409,"Diffusion refusée : vérifiez le secteur du partenaire et que cette demande n’a pas déjà été attribuée, réservée ou diffusée. Actualisez le dossier.");
    let notificationPending=false;
    if(!result.data?.alreadyReleased) {
      try { const sent = await processNotifications(`${id}:manual-partner:${partnerId}`); notificationPending=sent.failed>0 || sent.sent<1; }
      catch {notificationPending=true;}
    }
    return NextResponse.json({...result.data,notificationPending},{headers});
  } catch(error) {return apiError(error);}
}
