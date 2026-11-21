type Appointment = { starts_at: string; ends_at: string };
type ReportStatus = {
  performed_at: string;
  submitted_at: string;
  client_validated_at: string | null;
  client_outcome: string | null;
};
export type PartnerIntervention = {
  id: string;
  public_reference: string | null;
  problem_type: string;
  status: string;
  customers: { name: string; address: string } | null;
  partner_appointments: Appointment | null;
  intervention_reports: ReportStatus[];
  invoices: { id: string }[];
};

export const partnerWorkLabels = {
  contact: "À contacter et à planifier",
  upcoming: "Rendez-vous à venir",
  report: "Compte rendu à envoyer",
  invoice: "Facture à déposer si le spa est réparé",
  review: "En attente de validation du client",
  quote: "Devis en cours",
  closed: "Clôturé",
} as const;

export function partnerWorkState(
  status: string | undefined,
  appointment: Appointment | null,
  reports: ReportStatus[],
  hasInvoice: boolean,
  now: number,
): keyof typeof partnerWorkLabels {
  if (status === "CLOSED" || status === "terminé") return "closed";
  const latest = reports.reduce<ReportStatus | undefined>(
    (current, report) => !current || current.submitted_at < report.submitted_at ? report : current,
    undefined,
  );
  if (latest && !latest.client_validated_at) return hasInvoice ? "review" : "invoice";
  if (latest?.client_validated_at && latest.client_outcome !== "quote_pending") return "closed";
  if (latest && (!appointment || Date.parse(appointment.starts_at) <= Date.parse(latest.performed_at))) return "quote";
  if (!appointment) return "contact";
  return Date.parse(appointment.ends_at) > now ? "upcoming" : "report";
}

export function partnerJobState(job: PartnerIntervention, now: number) {
  return partnerWorkState(job.status, job.partner_appointments, job.intervention_reports, Boolean(job.invoices?.length), now);
}

export function partnerHasUpcomingAppointment(job: PartnerIntervention, now: number) {
  return job.partner_appointments && Date.parse(job.partner_appointments.ends_at) > now && partnerJobState(job, now) !== "closed";
}

export function partnerAppointmentLabel(date: string) {
  return new Date(date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
