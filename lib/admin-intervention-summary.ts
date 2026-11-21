import { partnerWorkLabels, partnerWorkState, type PartnerIntervention } from "./partner-work";

export type AdminInterventionReport = PartnerIntervention["intervention_reports"][number] & {
  id: string;
  findings?: string;
  actions?: string;
  next_steps?: string;
  responsiveness?: number | null;
  professionalism?: number | null;
  pricing?: number | null;
};

export type AdminInterventionSummary = {
  status: string;
  assigned_partner_id?: string | null;
  partner_kept_at?: string | null;
  intervened_at?: string | null;
  partner_appointments?: PartnerIntervention["partner_appointments"];
  intervention_reports?: AdminInterventionReport[];
  invoices?: { id: string; file_name?: string }[];
};

export const interventionSummaryFields = `
  intervened_at,
  partner_appointments(starts_at,ends_at),
  intervention_reports(id,performed_at,submitted_at,findings,actions,next_steps,client_validated_at,client_outcome,responsiveness,professionalism,pricing),
  invoices:client_documents(id,file_name)
`;

export function adminInterventionState(dossier: AdminInterventionSummary, now = Date.now()) {
  if (!["CLOSED", "terminé"].includes(dossier.status) && dossier.intervened_at && !dossier.partner_appointments && !dossier.intervention_reports?.length) return "recorded";
  return partnerWorkState(dossier.status, dossier.partner_appointments || null, dossier.intervention_reports || [], Boolean(dossier.invoices?.length), now);
}

export const adminInterventionLabels = {
  ...partnerWorkLabels,
  report: "Compte rendu attendu",
  contact: "À contacter ou à planifier",
  recorded: "Intervention enregistrée · suivi à compléter",
};

export const adminInterventionOutcomes: Record<string, string> = {
  repaired: "Spa réparé", quote_pending: "Devis en cours", abandoned: "Projet abandonné",
};
