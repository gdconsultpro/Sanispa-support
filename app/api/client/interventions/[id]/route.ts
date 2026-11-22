import { NextResponse } from "next/server";
import { getAuthenticatedUser, rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { interventionCase, interventionError, loadIntervention, reviewSchema } from "@/lib/interventions";
import { loadFieldPhotos } from "@/lib/partner-field-photos";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) throw new HttpError(401, "Connexion requise.");
    const { id } = await context.params;
    const dossier = await interventionCase(supabase, id, { userId: user.id });
    const query = new URL(request.url).searchParams;
    const headers = { "Cache-Control": "private, no-store" };
    if (query.has("photos")) {
      const reportId = z.string().uuid().parse(query.get("photos"));
      const { data: report, error: reportError } = await supabase.from("intervention_reports").select("partner_id")
        .eq("diagnostic_id", id).eq("id", reportId).maybeSingle();
      if (reportError) throw reportError;
      if (!report) throw new HttpError(404, "Compte rendu introuvable.");
      const { data: session, error } = await supabase.from("partner_field_sessions").select("id")
        .eq("diagnostic_id", id).eq("partner_id", report.partner_id).eq("report_id", reportId).not("submitted_at", "is", null).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ photos: session ? await loadFieldPhotos(supabase, report.partner_id, session.id) : [] }, { headers });
    }
    return NextResponse.json({ ...await loadIntervention(supabase, id), dossierReference: dossier.public_reference, dossierStatus: dossier.status, assignedPartner: Boolean(dossier.assigned_partner_id) }, { headers });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) throw new HttpError(401, "Connexion requise.");
    const { id } = await context.params;
    await interventionCase(supabase, id, { userId: user.id });
    await rateLimit(supabase, `review:${user.id}`, 20);
    const review = reviewSchema.parse(await readJson(request, 1500));
    const { data: report, error } = await supabase.from("intervention_reports").select("id").eq("id", review.reportId).eq("diagnostic_id", id).maybeSingle();
    if (error) throw error;
    if (!report) throw new HttpError(404, "Compte rendu introuvable.");
    const saved = await supabase.rpc("validate_intervention_report", { p_report: review.reportId, p_actor: user.id, p_outcome: review.outcome,
      p_responsiveness: review.responsiveness, p_professionalism: review.professionalism, p_pricing: review.pricing });
    if (saved.error) throw interventionError(saved.error);
    return NextResponse.json({ saved: true });
  } catch (e) { return apiError(e); }
}
