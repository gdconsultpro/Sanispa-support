import { createHash } from "node:crypto";
import { sendFieldReportPdfEmail } from "./email";
import { HttpError } from "./http";
import type { getSupabaseAdmin } from "./supabase";

export function fieldReportFilename(reportId: string) {
  return `compte-rendu-${reportId.slice(0, 8)}.pdf`;
}

export async function deliverFieldReport(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  delivery: { reportId: string; email: string; company: string; pdf: Buffer },
) {
  const { reportId, email, company, pdf } = delivery;
  const canRetry = (process.env.EMAIL_PROVIDER || "resend").toLowerCase() === "resend";
  const { data: claim, error } = await supabase.rpc("claim_partner_field_pdf_delivery", {
    p_report: reportId, p_recipient: email, p_retry: canRetry,
  });
  if (error) throw error;
  if (claim?.state === "sent") return { sentAt: claim.sentAt };
  if (claim?.state === "busy") throw new HttpError(409, "Un envoi est en cours. Actualisez la fiche dans un instant.");
  if (claim?.state !== "claimed") throw new HttpError(409, "L’envoi précédent reste à vérifier. Le PDF est disponible au téléchargement.");

  const key = `field-pdf:${reportId}:${createHash("sha256").update(email).digest("hex")}`;
  try {
    const response = await sendFieldReportPdfEmail({ email, company, pdf, filename: fieldReportFilename(reportId), key });
    if (response.skipped) throw new Error("Email unavailable");
  } catch {
    if (canRetry) await supabase.from("partner_field_pdf_deliveries").update({ locked_until: null })
      .eq("report_id", reportId).eq("recipient", email).eq("locked_until", claim.lease).is("sent_at", null);
    throw new HttpError(503, "L’envoi du PDF n’a pas pu être confirmé. Actualisez la fiche ou réessayez.");
  }
  const sentAt = new Date().toISOString();
  const saved = await supabase.from("partner_field_pdf_deliveries").update({ sent_at: sentAt, locked_until: null })
    .eq("report_id", reportId).eq("recipient", email).eq("locked_until", claim.lease).is("sent_at", null).select("sent_at").single();
  if (saved.error) throw saved.error;
  return { sentAt: saved.data.sent_at };
}
