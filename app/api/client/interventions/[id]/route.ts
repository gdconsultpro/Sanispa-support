import { NextResponse } from "next/server";
import { getAuthenticatedUser, rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { interventionCase, interventionError, loadIntervention, reviewSchema } from "@/lib/interventions";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) throw new HttpError(401, "Connexion requise.");
    const { id } = await context.params;
    await interventionCase(supabase, id, { userId: user.id });
    return NextResponse.json(await loadIntervention(supabase, id), { headers: { "Cache-Control": "private, no-store" } });
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
