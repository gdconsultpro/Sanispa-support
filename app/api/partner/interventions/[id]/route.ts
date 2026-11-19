import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/client-auth";
import { interventionActionSchema, interventionCase, interventionError, loadIntervention } from "@/lib/interventions";
import { processNotifications } from "@/lib/notifications";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { partner, supabase } = await getAuthenticatedPartner(request);
    if (!partner) throw new HttpError(401, "Connexion partenaire requise.");
    const { id } = await context.params;
    const dossier = await interventionCase(supabase, id, { partnerId: partner.id });
    return NextResponse.json({ ...await loadIntervention(supabase, id), dossierReference: dossier.public_reference }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { user, partner, supabase } = await getAuthenticatedPartner(request);
    if (!user || !partner) throw new HttpError(401, "Connexion partenaire requise.");
    const { id } = await context.params;
    await interventionCase(supabase, id, { partnerId: partner.id });
    await rateLimit(supabase, `intervention:${partner.id}`, 30);
    const action = interventionActionSchema.parse(await readJson(request, 20000));
    const result = action.action === "schedule"
      ? await supabase.rpc("save_partner_appointment", { p_diagnostic: id, p_partner: partner.id, p_actor: user.id, p_start: action.start, p_end: action.end })
      : await supabase.rpc("submit_intervention_report", { p_id: action.id, p_diagnostic: id, p_partner: partner.id, p_actor: user.id,
        p_performed: action.performedAt, p_findings: action.findings, p_actions: action.actions, p_next: action.nextSteps, p_on_site: action.onSite });
    if (result.error) throw interventionError(result.error);
    if (action.action === "report") {
      try { await processNotifications(`report:${action.id}`); }
      catch { console.error("Notification du compte rendu à relancer."); }
    }
    return NextResponse.json({ saved: true });
  } catch (e) { return apiError(e); }
}
