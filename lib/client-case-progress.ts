export type ClientCase = {
  id: string;
  public_reference?: string | null;
  created_at: string;
  status: string;
  problem_type: string;
  choice: string | null;
  payment_status: string | null;
  assigned_at?: string | null;
  intervened_at?: string | null;
  intervened_company_name?: string | null;
  assigned_partner?: { company_name: string } | null;
  appointment?: { starts_at: string; ends_at: string; updated_at: string } | null;
  reports?: { submitted_at: string; client_validated_at: string | null; client_outcome: string | null }[];
  invoices?: { created_at: string }[];
  updates?: { created_at: string }[];
  visios?: { status: "requested" | "scheduled"; starts_at: string | null; updated_at: string }[];
};

export function clientCaseProgress(dossier: ClientCase, now = Date.now()) {
  const detail = `/espace-client/interventions/${dossier.id}`;
  const report = dossier.reports?.[0];
  const invoice = dossier.invoices?.[0];
  const video = dossier.visios?.[0];
  const appointment = dossier.appointment;
  const updatedAt = [
    dossier.created_at, dossier.assigned_at, dossier.intervened_at, appointment?.updated_at,
    report?.submitted_at, report?.client_validated_at, invoice?.created_at, dossier.updates?.[0]?.created_at, video?.updated_at,
  ].reduce<string>((latest, date) => date && Date.parse(date) > Date.parse(latest) ? date : latest, dossier.created_at);
  const progress = (label: string, description: string, action: string, href = detail, needsAttention = false) => ({
    label, description, action, href, needsAttention, updatedAt,
  });
  if (report && !report.client_validated_at) {
    return progress("Rapport à valider", "Le compte rendu est disponible. Relisez les travaux effectués et indiquez le résultat de l’intervention.", "Valider le rapport", detail + "#validation", true);
  }
  if (["CLOSED", "terminé", "clôturé"].includes(dossier.status) || report?.client_outcome === "repaired" || report?.client_outcome === "abandoned") {
    return progress("Dossier terminé", "Les informations et les documents disponibles restent consultables.", "Consulter mon dossier");
  }
  if (report?.client_outcome === "quote_pending") {
    return progress("Devis en cours", "Le devis reste attendu. Retrouvez le compte rendu et les documents déposés dans votre dossier.", "Consulter mon dossier");
  }
  if (dossier.choice === "remote" && dossier.problem_type === "traitement-eau") {
    return progress("Assistance eau", "Votre prédiagnostic est disponible pour guider l’assistant.", "Ouvrir mon assistance eau", `/premium/assistant?topic=eau&diagnosticId=${dossier.id}`);
  }
  if (appointment && Date.parse(appointment.ends_at) >= now) {
    return progress("Rendez-vous confirmé", "Retrouvez le créneau de votre intervention.", "Voir mon rendez-vous", detail + "#rendez-vous");
  }
  if (dossier.intervened_at || (appointment && Date.parse(appointment.ends_at) < now)) {
    return progress("Compte rendu attendu", "Le compte rendu sera visible dès qu’il sera déposé.", "Suivre l’intervention", detail + "#rapport");
  }
  if (video?.status === "scheduled") {
    return progress("Visio confirmée", "Le créneau et le lien de connexion sont disponibles dans vos rendez-vous en visio.", "Voir ma visio", `/visio?diagnosticId=${dossier.id}`);
  }
  if (video?.status === "requested") {
    return progress("Visio en attente de confirmation", "SANISPA vous communiquera le créneau et le lien après confirmation.", "Suivre ma demande de visio", `/visio?diagnosticId=${dossier.id}`);
  }
  if (dossier.status === "RDV demandé") {
    return progress("Rendez-vous demandé", "Le suivi sera mis à jour quand une date sera disponible.", "Suivre mon rendez-vous", detail + "#rendez-vous");
  }
  if (dossier.assigned_partner || dossier.status === "ASSIGNED") {
    return progress("Technicien désigné", "Le créneau apparaîtra ici dès qu’il sera renseigné.", "Suivre l’intervention", detail + "#rendez-vous");
  }
  if (dossier.status === "devis envoyé") {
    return progress("Devis envoyé", "Consultez les informations et documents disponibles pour cette demande.", "Consulter mon dossier");
  }
  if (dossier.status === "en analyse") {
    return progress("En cours d’analyse", "SANISPA examine votre demande. Le suivi sera mis à jour dès qu’une suite est disponible.", "Suivre mon dossier");
  }
  return progress("Demande reçue", "Votre déclaration a été envoyée à SANISPA. Vous pouvez suivre son avancement ici.", "Suivre mon dossier");
}
