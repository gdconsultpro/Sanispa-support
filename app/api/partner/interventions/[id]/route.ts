import { NextResponse } from "next/server";
import { requirePartnerOwner } from "@/lib/partner-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/client-auth";
import { interventionActionSchema, interventionCase, interventionError, loadIntervention } from "@/lib/interventions";
import { processNotifications } from "@/lib/notifications";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { partner, supabase } = await requirePartnerOwner(request);
    const { id } = await context.params;
    const dossier = await interventionCase(supabase, id, { partnerId: partner.id });
    const [workspace, details, contact] = await Promise.all([
      loadIntervention(supabase, id),
      supabase.from("diagnostics").select("problem_type,preview_description,customers(name,address,phone,email),diagnostic_answers(question_key,answer)")
        .eq("id", id).eq("assigned_partner_id", partner.id).is("archived_at", null)
        .in("diagnostic_answers.question_key", ["description", "noise_description", "pump_details"]).maybeSingle(),
      supabase.from("partner_private_clients").select("id").eq("partner_id", partner.id)
        .eq("source_diagnostic_id", id).is("deleted_at", null).maybeSingle(),
    ]);
    if (details.error || contact.error) throw details.error || contact.error;
    if (!details.data) throw new HttpError(404, "Dossier introuvable.");
    const clientId = contact.data?.id;
    const [spas, link] = clientId ? await Promise.all([
      supabase.from("partner_client_spas").select("id,brand,model,serial_number,updated_at")
        .eq("partner_id", partner.id).eq("client_id", clientId).order("brand").order("model"),
      supabase.from("partner_client_spa_dossiers").select("spa_id")
        .eq("partner_id", partner.id).eq("client_id", clientId).eq("diagnostic_id", id).maybeSingle(),
    ]) : [null, null];
    if (spas?.error || link?.error) throw spas?.error || link?.error;
    const values = details.data;
    const customer = Array.isArray(values.customers) ? values.customers[0] ?? null : values.customers;
    const description = values.preview_description?.trim() || values.diagnostic_answers.map(answer => answer.answer).filter(Boolean).join("\n");
    return NextResponse.json({ ...workspace, dossierReference: dossier.public_reference, dossierStatus: dossier.status,
      job: { customer, problemType: values.problem_type, description, clientId: clientId ?? null, spaId: link?.data?.spa_id ?? null, spas: spas?.data ?? [] },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { user, partner, supabase } = await requirePartnerOwner(request);
    const { id } = await context.params;
    await interventionCase(supabase, id, { partnerId: partner.id });
    await rateLimit(supabase, `intervention:${partner.id}`, 30);
    const action = interventionActionSchema.parse(await readJson(request, 20000));
    const identity = { p_diagnostic: id, p_partner: partner.id, p_actor: user.id };
    const result = action.action === "report"
      ? await supabase.rpc("submit_intervention_report", { ...identity, p_id: action.id,
        p_performed: action.performedAt, p_findings: action.findings, p_actions: action.actions, p_next: action.nextSteps, p_on_site: action.onSite })
      : await supabase.rpc(action.action === "schedule" ? "save_partner_appointment" : "cancel_partner_appointment",
        { ...identity, p_start: action.start, p_end: action.end });
    if (result.error) throw interventionError(result.error);
    if (action.action === "report") {
      try { await processNotifications(`report:${action.id}`); }
      catch { console.error("Notification du compte rendu à relancer."); }
    }
    return NextResponse.json({ saved: true });
  } catch (e) { return apiError(e); }
}
