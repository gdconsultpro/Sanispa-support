import { NextResponse } from "next/server";
import { getAuthenticatedUser, rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { interventionCase, interventionError, loadIntervention, reviewSchema } from "@/lib/interventions";
import { loadFieldPhotos } from "@/lib/partner-field-photos";
import { buildFieldReportPdf } from "@/lib/partner-field-pdf";
import { fieldReportFilename } from "@/lib/partner-field";
import { problemLabel } from "@/lib/display-labels";
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
    if (query.has("rapport")) {
      const reportId = z.string().uuid().parse(query.get("rapport"));
      const [report, detail] = await Promise.all([
        supabase.from("intervention_reports").select("id,partner_id,performed_at,submitted_at,findings,actions,next_steps")
          .eq("diagnostic_id", id).eq("id", reportId).maybeSingle(),
        supabase.from("diagnostics").select("problem_type,customers(name,address,spa_brand,spa_model)")
          .eq("id", id).eq("user_id", user.id).is("archived_at", null).maybeSingle(),
      ]);
      if (report.error || detail.error) throw report.error || detail.error;
      if (!report.data || !detail.data) throw new HttpError(404, "Compte rendu introuvable.");
      const partner = await supabase.from("partners").select("company_name").eq("id", report.data.partner_id).maybeSingle();
      if (partner.error) throw partner.error;
      const customer = Array.isArray(detail.data.customers) ? detail.data.customers[0] : detail.data.customers;
      const pdf = await buildFieldReportPdf(supabase, {
        source: "sanispa", visitId: id, partnerId: report.data.partner_id,
        company: partner.data?.company_name ?? "Partenaire SANISPA", reference: dossier.public_reference,
        customerName: customer?.name || "Client", address: customer?.address,
        title: problemLabel(detail.data.problem_type), spa: [customer?.spa_brand, customer?.spa_model].filter(Boolean).join(" "),
        requireSignature: true,
      }, report.data);
      return new NextResponse(pdf, { headers: { ...headers, "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fieldReportFilename(reportId)}"` } });
    }
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
    const [{ reports, ...workspace }, additionalInformation] = await Promise.all([
      loadIntervention(supabase, id),
      supabase.from("diagnostic_answers").select("answer")
        .eq("diagnostic_id", id).eq("question_key", "additional_information")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (additionalInformation.error) throw additionalInformation.error;
    const signed = new Set<string>();
    if (reports.length) {
      const { data, error } = await supabase.from("partner_field_sessions").select("report_id")
        .eq("diagnostic_id", id).not("submitted_at", "is", null).not("customer_signature", "is", null);
      if (error) throw error;
      data.forEach(session => signed.add(session.report_id));
    }
    return NextResponse.json({ ...workspace, reports: reports.map((report: { id: string }) => ({ ...report, signedPdf: signed.has(report.id) })),
      additionalInformation: additionalInformation.data?.answer || null,
      dossierReference: dossier.public_reference, dossierStatus: dossier.status, assignedPartner: Boolean(dossier.assigned_partner_id) }, { headers });
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
