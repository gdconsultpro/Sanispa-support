import { z } from "zod";
import { HttpError } from "./http";
import { partnerDispatchDecision } from "./partner-release";
export const dispatchCommand = z.union([
  z.object({action:z.literal("keep")}).strict(),
  z.object({action:z.literal("release").default("release"),partnerId:z.string().uuid()}).strict()
]);

export async function loadPartnerDispatch(supabase:any,id:string) {
  const {data:d,error} = await supabase.from("diagnostics")
    .select("choice,request_type,status,archived_at,department,partner_kept_at,partner_kept_by,partner_released_at,partner_released_by,matched_partner_ids,assigned_partner_id")
    .eq("id",id).single();
  if(error) throw error;
  const [eligible,purchases,notification] = await Promise.all([
    supabase.from("partner_departments").select("partners!inner(id,company_name,active,leads_paid)").eq("department",d.department).eq("partners.active",true),
    supabase.from("lead_purchases").select("status").eq("request_id",id).in("status",["pending","paid","granted"]).limit(1),
    d.partner_released_at && d.matched_partner_ids?.[0]
      ? supabase.from("notification_jobs").select("state,sent_at,payload").eq("key",`${id}:manual-partner:${d.matched_partner_ids[0]}`).maybeSingle()
      : Promise.resolve({data:null,error:null})
  ]);
  if(eligible.error || purchases.error || notification.error) throw eligible.error || purchases.error || notification.error;
  const decision=partnerDispatchDecision({...d,lead_purchase:purchases.data?.[0]});
  return {
    decision,decidedAt:d.partner_kept_at || d.partner_released_at || null,
    selectedPartner:notification.data?.payload?.partners?.[0]?.companyName || null,
    canKeep:decision === "pending" && !d.archived_at,
    canRelease:decision === "pending" && !d.archived_at && ["NEW","AVAILABLE","nouvelle"].includes(d.status),
    notification:notification.data ? {state:notification.data.state,sentAt:notification.data.sent_at} : null,
    partners:(eligible.data ?? []).map((r:any)=>Array.isArray(r.partners)?r.partners[0]:r.partners)
  };
}

/** Administrator identity must be verified by the route, then checked again by the database. */
export async function decidePartnerDispatch(supabase:any,id:string,actor:string,command:z.infer<typeof dispatchCommand>) {
  if(command.action === "keep") {
    const result=await supabase.rpc("keep_partner_intervention",{p_diagnostic:id,p_actor:actor});
    if(result.error) throw decisionError(result.error);
    return {changed:!result.data?.alreadyKept,notificationKey:null};
  }
  const [{data:d,error},{data:p,error:partnerError}]=await Promise.all([
    supabase.from("diagnostics").select("id,problem_type,department,customers(spa_brand,spa_model)").eq("id",id).single(),
    supabase.from("partners").select("id,company_name,contact_name,email").eq("id",command.partnerId).single()
  ]);
  if(error || partnerError) throw error || partnerError;
  const customer=Array.isArray(d.customers)?d.customers[0]:d.customers;
  const key=`${id}:manual-partner:${p.id}`;
  const job={diagnosticId:id,notificationKey:key,partners:[{id:p.id,companyName:p.company_name,contactName:p.contact_name,email:p.email}],problemType:d.problem_type,department:d.department,postalCode:"",city:"",spaBrand:customer?.spa_brand,spaModel:customer?.spa_model,answers:[]};
  const result=await supabase.rpc("release_partner_intervention",{p_diagnostic:id,p_partner:p.id,p_actor:actor,p_job:job});
  if(result.error) throw decisionError(result.error);
  return {changed:!result.data?.alreadyReleased,notificationKey:result.data?.alreadyReleased?null:key};
}
function decisionError(error:{message?:string}) {
  const code=error.message || "";
  const reason=code.includes("KEPT_BY_SANISPA") ? "Ce dossier est conservé chez SANISPA."
    : code.includes("ALREADY_RELEASED") ? "Ce dossier a déjà été transmis. Son destinataire est conservé."
    : code.includes("ACQUISITION_STARTED") ? "Une réservation ou une attribution existe déjà. Ses conditions sont conservées."
    : code.includes("PARTNER_INELIGIBLE") ? "Ce partenaire n’est plus actif ou ne couvre pas le département du dossier."
    : "Cette décision n’est pas disponible pour ce dossier ou son statut actuel.";
  return new HttpError(409,`${reason} Actualisez le dossier avant de poursuivre.`);
}
