import { z } from "zod";
import { HttpError } from "./http";
import type { FieldReport, FieldSource } from "./partner-field";
import { fieldForms, fieldPhotoKinds, fieldPhotoLabels, fieldReportRows } from "./partner-field-forms";
import { fieldPhotoBucket, fieldPhotoPath } from "./partner-field-photos";
import { hasSignatureStroke, maxSignaturePoints, maxSignatureStrokes, signatureHeight, signatureWidth } from "./partner-field-signature";
import { buildSummaryPdf } from "./pdf";
import type { getSupabaseAdmin } from "./supabase";

const signaturePoint = z.tuple([z.number().int().min(0).max(signatureWidth), z.number().int().min(0).max(signatureHeight)]);
export const customerSignature = z.object({
  name: z.string().trim().min(1).max(140).transform(name => name.replace(/\s+/g, " ")),
  strokes: z.array(z.array(signaturePoint).min(2).max(maxSignaturePoints)).min(1).max(maxSignatureStrokes)
    .refine(strokes => strokes.every(hasSignatureStroke) && strokes.reduce((count, stroke) => count + stroke.length, 0) <= maxSignaturePoints),
}).strict();
const pdfDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export async function buildFieldReportPdf(supabase: ReturnType<typeof getSupabaseAdmin>, data: {
  source: FieldSource; visitId: string; partnerId: string; company: string; customerName: string;
  address?: string | null; title: string; reference?: string | null; spa?: string | null;
  requireSignature?: boolean;
}, report: FieldReport) {
  const session = await supabase.from("partner_field_sessions").select("id,customer_signature,submitted_at,report_details")
    .eq("partner_id", data.partnerId).eq("report_id", report.id)
    .eq(data.source === "private" ? "private_visit_id" : "diagnostic_id", data.visitId).maybeSingle();
  if (session.error) throw session.error;
  if (data.requireSignature && (!session.data?.customer_signature || !session.data.submitted_at))
    throw new HttpError(404, "Compte rendu signé introuvable.");
  const photos: { bytes: Uint8Array; caption?: string }[] = [];
  if (session.data) {
    const sessionId = session.data.id;
    const saved = await supabase.from("partner_field_photos").select("id,kind").eq("session_id", sessionId)
      .neq("kind", "receipt").order("created_at").order("id");
    if (saved.error) throw saved.error;
    photos.push(...await Promise.all(saved.data.map(async photo => {
      const asset = await supabase.storage.from(fieldPhotoBucket).download(fieldPhotoPath(data.partnerId, sessionId, photo.id));
      if (asset.error) throw new HttpError(503, "Une photo est temporairement indisponible. Réessayez de télécharger le PDF.");
      return { bytes: new Uint8Array(await asset.data.arrayBuffer()), caption: fieldPhotoLabels[z.enum(fieldPhotoKinds).parse(photo.kind)] };
    })));
  }
  const details: FieldReport["details"] = session.data?.report_details ?? report.details;
  return buildSummaryPdf([
    "Intervention", ...(data.reference ? ["Numéro de dossier : " + data.reference] : []),
    "Client : " + data.customerName,
    ...(data.address ? ["Adresse : " + data.address] : []),
    "Date : " + pdfDate.format(new Date(report.performed_at)),
    "Motif : " + data.title,
    ...(details ? [
      fieldForms[details.template].title,
      ...fieldReportRows(details).map(row => row.label + " : " + row.value),
    ] : [
      "Spa : " + (data.spa || "Non renseigné"),
      "Constat sur place", report.findings,
      "Travaux et contrôles effectués", report.actions,
    ]),
    "Suite à donner", report.next_steps,
  ], { field: {
    company: data.company, photos, issuedAt: report.submitted_at,
    signature: session.data?.customer_signature
      ? { ...customerSignature.parse(session.data.customer_signature), signedAt: pdfDate.format(new Date(session.data.submitted_at)) } : undefined,
  } });
}
