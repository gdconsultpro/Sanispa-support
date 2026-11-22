import { partnerClientAddress, partnerMapPath, partnerPrivateVisitPath, plannerDate, plannerDay, type PendingPartnerDossier, type PendingPrivatePartnerVisit,
  type PlannerMapIntervention, type PlannerPeriod, type PlannerTechnician, type PrivatePartnerVisit, type SanispaPartnerVisit } from "./partner-planner";
import { problemLabel } from "./display-labels";

export const workStatusLabels = {
  pending: "À planifier",
  scheduled: "Planifiée",
  in_progress: "En cours",
  due: "À terminer",
  review: "Terminée · À valider",
  validated: "Validée",
  followup: "En suivi",
  closed: "Clôturée",
} as const;
export type PartnerWorkStatus = keyof typeof workStatusLabels;
export type WorkFilterStatus = PartnerWorkStatus | "all";
export const workFilterLabels: Record<WorkFilterStatus, string> = {
  all: "Toutes les interventions", pending: "À planifier", scheduled: "Planifiées", in_progress: "En cours",
  due: "À terminer", review: "À valider", validated: "Validées", followup: "En suivi", closed: "Clôturées",
};
const legacyStatus: Record<string, PartnerWorkStatus> = {
  planning: "scheduled", "a-planifier": "pending", "a-terminer": "due", "en-suivi": "review", clotures: "validated",
};

export type WorkspaceSelection = { day: string; period: PlannerPeriod; status: WorkFilterStatus; technician: string };
export type PartnerWorkspaceData = {
  visits: PrivatePartnerVisit[]; sanispa: SanispaPartnerVisit[]; technicians: PlannerTechnician[];
  pendingVisits?: PendingPrivatePartnerVisit[]; pendingDossiers?: PendingPartnerDossier[]; historyDossiers?: PendingPartnerDossier[];
};
export function readWorkspaceSelection(search: string, hash = ""): Partial<WorkspaceSelection> {
  const params = new URLSearchParams(search);
  const day = params.get("jour");
  const period = params.get("periode");
  const status = params.get("statut");
  const technician = params.get("technicien");
  const validDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(+plannerDay(day)) && plannerDate(plannerDay(day)) === day;
  const validTech = technician === "" || technician && /^[a-f0-9-]{36}$/i.test(technician);
  return {
    ...(validDay ? { day } : {}),
    ...(["day", "week", "month"].includes(period ?? "") ? { period: period as PlannerPeriod } : {}),
    ...(status && Object.hasOwn(workFilterLabels, status) ? { status: status as WorkFilterStatus }
      : legacyStatus[hash.slice(1)] ? { status: legacyStatus[hash.slice(1)] } : {}),
    ...(validTech ? { technician } : {}),
  };
}

export function workspacePath(view: "agenda" | "map" | "list", selection?: Partial<WorkspaceSelection>, highlight?: string) {
  const path = view === "map" ? partnerMapPath : view === "list" ? "/partenaire/interventions" : "/partenaire/planning";
  const query = new URLSearchParams();
  if (selection?.day) query.set("jour", selection.day);
  if (selection?.period) query.set("periode", selection.period);
  if (selection?.status) query.set("statut", selection.status);
  if (selection?.technician !== undefined && selection.technician !== "all") query.set("technicien", selection.technician);
  if (highlight) query.set("intervention", highlight);
  return query.size ? path + (view === "map" ? "&" : "?") + query.toString() : path;
}

export function matchesWorkFilters(item: Pick<PlannerMapIntervention, "workStatus" | "technicianId">, status: WorkFilterStatus, technician: string) {
  return (status === "all" || item.workStatus === status) && (technician === "all" || (item.technicianId ?? "") === technician);
}

export function workItemPath(item: Pick<PlannerMapIntervention, "id" | "dossierId" | "workStatus">) {
  if (!item.dossierId) return partnerPrivateVisitPath(item.id.replace(/^private:/, ""));
  const section = item.workStatus === "review" || item.workStatus === "validated" ? "#rapport" : item.workStatus === "pending" ? "#rendez-vous" : "";
  return "/partenaire/interventions/" + item.dossierId + section;
}

export function privateWorkStatus(visit: Pick<PrivatePartnerVisit | PendingPrivatePartnerVisit, "starts_at" | "ends_at" | "completed_at" | "validated_at" | "field_started_at">, now: number): PartnerWorkStatus {
  if (visit.validated_at) return "validated";
  if (visit.completed_at) return "review";
  if (visit.field_started_at) return "in_progress";
  if (!visit.starts_at) return "pending";
  return visit.ends_at && Date.parse(visit.ends_at) <= now ? "due" : "scheduled";
}

export function sanispaWorkStatus(dossier: Omit<PendingPartnerDossier, "id">, visit: SanispaPartnerVisit | undefined, now: number) {
  const latest = dossier.intervention_reports?.reduce<NonNullable<PendingPartnerDossier["intervention_reports"]>[number] | undefined>(
    (current, report) => !current || Date.parse(report.submitted_at) > Date.parse(current.submitted_at) ? report : current, undefined);
  let workStatus: PartnerWorkStatus;
  if (dossier.status === "CLOSED" || dossier.status === "terminé") workStatus = latest?.client_validated_at ? "validated" : "closed";
  else if (latest && !latest.client_validated_at) workStatus = "review";
  else if (latest && latest.client_outcome !== "quote_pending") workStatus = "validated";
  else if (visit && dossier.partner_field_sessions?.some(session => session.submitted_at === null && Date.parse(session.appointment_start) === Date.parse(visit.starts_at))) workStatus = "in_progress";
  else if (latest && (!visit || Date.parse(visit.starts_at) <= Date.parse(latest.performed_at))) workStatus = "followup";
  else if (!visit) workStatus = dossier.intervened_at ? "followup" : "pending";
  else workStatus = Date.parse(visit.ends_at) <= now ? "due" : "scheduled";
  return { workStatus, activityAt: visit?.starts_at ?? latest?.performed_at ?? dossier.intervened_at ?? (workStatus === "pending" ? null : dossier.created_at ?? null) };
}

export function workspaceWorkItems(data: PartnerWorkspaceData, now: number): PlannerMapIntervention[] {
  const own = [...data.visits, ...(data.pendingVisits ?? [])].map(visit => {
    const workStatus = privateWorkStatus(visit, now);
    return {
      id: "private:" + visit.id, title: `${visit.title} · ${visit.client.name}`,
      startsAt: visit.starts_at, endsAt: visit.ends_at ?? undefined, activityAt: visit.starts_at,
      technicianId: visit.technician_id, address: partnerClientAddress(visit.client), description: visit.description, workStatus,
      latitude: visit.latitude ?? visit.client.latitude, longitude: visit.longitude ?? visit.client.longitude,
      approximateLocation: visit.approximateLocation, client: visit.client, visit,
      reschedule: { source: "private" as const, id: visit.id, version: visit.updated_at, closed: Boolean(visit.completed_at || visit.field_started_at) },
    };
  });
  function assigned(id: string, dossier: Omit<PendingPartnerDossier, "id">, visit?: SanispaPartnerVisit): PlannerMapIntervention {
    const { workStatus, activityAt } = sanispaWorkStatus(dossier, visit, now);
    return {
      id: "sanispa:" + id, dossierId: id, problemType: dossier.problem_type, startsAt: visit?.starts_at ?? null, endsAt: visit?.ends_at, activityAt,
      technicianId: visit?.technician_id ?? null, workStatus,
      title: `${problemLabel(dossier.problem_type)} · ${dossier.customer?.name || "Client"}`, address: dossier.customer?.address ?? "",
      latitude: visit?.latitude ?? dossier.latitude ?? null, longitude: visit?.longitude ?? dossier.longitude ?? null,
      approximateLocation: visit?.approximateLocation ?? dossier.approximateLocation,
      reference: dossier.public_reference, description: dossier.preview_description,
      reschedule: visit ? { source: "sanispa", id, version: visit.updated_at, closed: workStatus !== "scheduled" && workStatus !== "due" } : undefined,
    };
  }
  return [...own, ...data.sanispa.map(visit => assigned(visit.diagnostic_id, visit.diagnostic, visit)),
    ...(data.pendingDossiers ?? []).map(dossier => assigned(dossier.id, dossier)),
    ...(data.historyDossiers ?? []).map(dossier => assigned(dossier.id, dossier))]
    .sort((left, right) => (left.activityAt ? Date.parse(left.activityAt) : Infinity) - (right.activityAt ? Date.parse(right.activityAt) : Infinity));
}
