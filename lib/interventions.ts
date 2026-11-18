import { z } from "zod";
import { HttpError } from "./http";

export const appointmentSchema = z.object({ action: z.literal("schedule"), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict();
export const reportSchema = z.object({
  action: z.literal("report"), id: z.string().uuid(), performedAt: z.string().datetime({ offset: true }),
  findings: z.string().trim().min(20).max(5000), actions: z.string().trim().min(20).max(5000),
  nextSteps: z.string().trim().min(5).max(3000), onSite: z.literal(true),
}).strict();
export const interventionActionSchema = z.discriminatedUnion("action", [appointmentSchema, reportSchema]);
export const reviewSchema = z.object({ reportId: z.string().uuid(), outcome: z.enum(["repaired", "quote_pending", "abandoned"]),
  responsiveness: z.number().int().min(1).max(5), professionalism: z.number().int().min(1).max(5), pricing: z.number().int().min(1).max(5),
}).strict();

export async function interventionCase(supabase: any, id: string, actor: { partnerId: string } | { userId: string }) {
  z.string().uuid().parse(id);
  const { data, error } = await supabase.from("diagnostics").select("id,user_id,spa_id,status,assigned_partner_id,archived_at")
    .eq("id", id).eq("partnerId" in actor ? "assigned_partner_id" : "user_id", "partnerId" in actor ? actor.partnerId : actor.userId).maybeSingle();
  if (error) throw error;
  if (!data || data.archived_at) throw new HttpError(404, "Dossier introuvable.");
  return data;
}
export async function loadIntervention(supabase: any, id: string) {
  const [appointment, reports, documents] = await Promise.all([
    supabase.from("partner_appointments").select("starts_at,ends_at").eq("diagnostic_id", id).maybeSingle(),
    supabase.from("intervention_reports").select("id,performed_at,findings,actions,next_steps,submitted_at,client_validated_at,client_outcome,responsiveness,professionalism,pricing").eq("diagnostic_id", id).order("submitted_at", { ascending: false }),
    supabase.from("client_documents").select("id,file_name,created_at,issued_by").eq("diagnostic_id", id).eq("document_type", "Facture d’intervention").in("issued_by", ["partner", "sanispa"]),
  ]);
  for (const result of [appointment, reports, documents]) if (result.error) throw result.error;
  return { appointment: appointment.data, reports: reports.data ?? [], invoices: documents.data ?? [] };
}
export function interventionError(error: { message?: string }) {
  const code = error.message || "";
  if (code.includes("INVOICE_REQUIRED")) return new HttpError(409, "Le partenaire doit d’abord déposer sa facture dans ce dossier pour confirmer le spa réparé. Votre saisie est conservée.");
  if (/ASSIGNED_PARTNER_REQUIRED|CLIENT_REQUIRED/.test(code)) return new HttpError(403, "Ce dossier n’est pas accessible à votre compte.");
  if (/ON_SITE_REPORT_REQUIRED|APPOINTMENT_IN_PAST/.test(code)) return new HttpError(400, "Vérifiez la date et confirmez que le rapport est rempli sur place.");
  if (/CLIENT_ACCOUNT_REQUIRED/.test(code)) return new HttpError(409, "SANISPA doit rattacher ce dossier au compte du client avant le rapport.");
  if (/APPOINTMENT_REQUIRED/.test(code)) return new HttpError(409, "Enregistrez d’abord le rendez-vous correspondant à cette visite, puis vérifiez la date du compte rendu.");
  if (/ALREADY_VALIDATED|CASE_CLOSED|REPORT_CONFLICT|one_pending_intervention_report/.test(code)) return new HttpError(409, "Le dossier a évolué. Actualisez avant de poursuivre ; un seul rapport peut être en attente de validation.");
  return error;
}
