export type PrivatePartnerClient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  street: string;
  postal_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  source_diagnostic_id: string | null;
  deleted_at?: string | null;
};

type Times = { starts_at: string; ends_at: string };
type ScheduledVisit = Times & { technician_id: string | null; updated_at: string };
type MapPosition = { latitude?: number | null; longitude?: number | null; approximateLocation?: boolean };
export type PrivatePartnerVisit = ScheduledVisit & {
  id: string;
  spa_id?: string | null;
  maintenance_due_on?: string | null;
  title: string;
  description: string;
  completed_at?: string | null;
  validated_at?: string | null;
  field_started_at?: string | null;
  client: PrivatePartnerClient;
} & MapPosition;
export type PendingPrivatePartnerVisit = Omit<PrivatePartnerVisit, "starts_at" | "ends_at"> & {
  starts_at: null;
  ends_at: null;
};
export type PartnerClientVisit = Pick<PrivatePartnerVisit, "id" | "title" | "starts_at" | "spa_id">;
export type PartnerPrivateVisitFile = {
  visit: PrivatePartnerVisit | PendingPrivatePartnerVisit;
  technicians: PlannerTechnician[];
  spa: PartnerClientSpa | null;
  canValidate?: boolean;
};
export type PartnerClientDossier = {
  id: string;
  spa_id?: string | null;
  problem_type: string;
  status: string;
  intervened_at: string | null;
  preview_description?: string | null;
  partner_appointments: Pick<ScheduledVisit, "starts_at" | "ends_at" | "technician_id"> | null;
};
export type PartnerClientHistory = {
  client: PrivatePartnerClient;
  spas: PartnerClientSpa[];
  visits: PartnerClientVisit[];
  dossier: PartnerClientDossier | null;
  technicians: PlannerTechnician[];
  more: boolean;
};
export type PartnerClientSpa = { id: string; brand: string; model: string; serial_number: string; updated_at: string };

export function partnerSpaName(spa: PartnerClientSpa) {
  return [spa.brand, spa.model].filter(Boolean).join(" ");
}

export function partnerSpaOption(spa: PartnerClientSpa) {
  return partnerSpaName(spa) + (spa.serial_number ? " · " + spa.serial_number : "");
}

export function partnerClientVisitTiming(endsAt: string | null, now: number) {
  return endsAt === null ? "pending" : Date.parse(endsAt) > now ? "scheduled" : "past";
}

export function partnerClientDossierTiming(dossier: PartnerClientDossier, now: number) {
  if (dossier.status === "CLOSED" || dossier.status === "terminé") return "past";
  const timing = partnerClientVisitTiming(dossier.partner_appointments?.ends_at ?? null, now);
  return timing === "pending" && dossier.intervened_at ? "past" : timing;
}

export type SanispaPartnerVisit = ScheduledVisit & MapPosition & {
  diagnostic_id: string;
  diagnostic: Omit<PendingPartnerDossier, "id">;
};

export type PlannerTechnician = { id: string; name: string };
export type PlannerSlot = { startsAt: string; technicianId: string | null };
export type PlannerAppointment = ScheduledVisit & {
  id: string;
  title: string;
  source: "private" | "sanispa";
  movable: boolean;
  address?: string;
  description?: string;
  workStatus?: PartnerWorkStatus;
};
export type PlannerQueueEntry = {
  durationMinutes?: number;
  maintenanceDueOn?: string | null;
  id: string;
  source: PlannerAppointment["source"];
  expectedAt: string | null;
  technicianId: string | null;
  title: string;
  customer: string;
  address: string;
  description?: string | null;
  reference?: string | null;
};

export const partnerClientsPath = "/partenaire/planning?view=clients";
export const partnerStockPath = "/partenaire/planning?view=stock";
export const partnerNewClientPath = partnerClientsPath + "&ajouter=1";
export const partnerMapPath = "/partenaire/planning?view=carte";
export const partnerNewVisitPath = "/partenaire/planning?nouvelle=1";
export const partnerPrivateVisitsPath = "/partenaire/interventions/privees/";
export const partnerEditVisitPrefix = "/partenaire/planning?modifier=";

export const partnerClientIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function partnerClientPath(id: string) {
  return partnerClientsPath + "&fiche=" + encodeURIComponent(id);
}
export function partnerPrivateVisitPath(id: string) {
  return partnerPrivateVisitsPath + encodeURIComponent(id);
}
export function partnerEditVisitPath(id: string) {
  return partnerEditVisitPrefix + encodeURIComponent(id);
}

export function partnerVisitMapPath(id: string, startsAt: string | null) {
  const query = new URLSearchParams({ visite: id });
  if (startsAt) query.set("jour", plannerDate(new Date(startsAt)));
  else query.set("statut", "pending");
  return partnerMapPath + "&" + query;
}

export type PartnerMapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  detail?: string;
  address?: string;
  pending?: boolean;
  step?: number;
  highlighted?: boolean;
  recordHref?: string;
  workStatus?: PartnerWorkStatus;
};

export type PendingPartnerDossier = MapPosition & {
  id: string;
  problem_type: string;
  status: string;
  public_reference?: string | null;
  preview_description?: string | null;
  intervened_at?: string | null;
  created_at?: string;
  intervention_reports?: {
    performed_at: string; submitted_at: string; client_validated_at: string | null; client_outcome: string | null;
  }[];
  partner_field_sessions?: { appointment_start: string; submitted_at: string | null }[];
  customer: { name: string | null; address: string | null } | null;
};

export type PlannerMapIntervention = {
  id: string;
  title: string;
  address: string;
  startsAt: string | null;
  endsAt?: string;
  technicianId: string | null;
  latitude: number | null;
  longitude: number | null;
  approximateLocation?: boolean;
  client?: PrivatePartnerClient;
  visit?: PrivatePartnerVisit | PendingPrivatePartnerVisit;
  dossierId?: string;
  problemType?: string;
  workStatus?: PartnerWorkStatus;
  activityAt?: string | null;
  reference?: string | null;
  description?: string | null;
  reschedule?: { source: "private" | "sanispa"; id: string; version: string; closed?: boolean };
};

export type TourBooking = {
  source: "private" | "sanispa";
  id: string;
  expected_at: string | null;
  starts_at: string;
  ends_at: string;
  technician_id: string;
};

export type MapCoordinate = { latitude: number; longitude: number };
type LocatedIntervention = PlannerMapIntervention & MapCoordinate;

function hasMapCoordinates(item: PlannerMapIntervention): item is LocatedIntervention {
  return item.latitude !== null && item.longitude !== null;
}

export function mapDistanceKm(left: MapCoordinate, right: MapCoordinate) {
  const radians = Math.PI / 180;
  const north = Math.sin((right.latitude - left.latitude) * radians / 2);
  const east = Math.sin((right.longitude - left.longitude) * radians / 2);
  const halfChord = north ** 2 + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * east ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, halfChord)));
}

export function nearbyPendingVisits(anchor: PlannerMapIntervention, items: PlannerMapIntervention[], radius: number) {
  if (!hasMapCoordinates(anchor)) return [];
  return items.flatMap(item => {
    if (item.startsAt || (item.workStatus && item.workStatus !== "pending") || !hasMapCoordinates(item) ||
        (anchor.technicianId && item.technicianId && item.technicianId !== anchor.technicianId)) return [];
    const distance = mapDistanceKm(anchor, item);
    return distance <= radius ? [{ item, distance }] : [];
  }).sort((left, right) => left.distance - right.distance || left.item.title.localeCompare(right.item.title, "fr"));
}

export function suggestedTourStart(endsAt: string, appointments: Array<{ startsAt: string; endsAt: string }> = [], now = new Date()) {
  const quarter = 15 * 60000;
  const after = (time: number) => Math.ceil((time + 30 * 60000) / quarter) * quarter;
  let start = after(Math.max(Date.parse(endsAt), +now));
  for (const appointment of [...appointments].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))) {
    const bookedEnd = Date.parse(appointment.endsAt);
    if (start < bookedEnd && Date.parse(appointment.startsAt) < start + 3600000) start = after(bookedEnd);
  }
  return new Date(start);
}

export type PlannerMapStatus = "scheduled" | "pending";

export function matchesPlannerMapFilters(item: Pick<PlannerMapIntervention, "startsAt" | "technicianId">,
  status: PlannerMapStatus, technician: string) {
  return (status === "scheduled") === Boolean(item.startsAt) &&
    (technician === "all" || (item.technicianId ?? "") === technician);
}

export type PrivatePartnerStock = {
  id: string;
  category: "piece" | "spa";
  label: string;
  reference: string;
  quantity: number;
  updated_at: string;
};

export type PlannerPeriod = "day" | "week" | "month";

export function plannerDate(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, "0")).join("-");
}

export function plannerDay(date: string, offset = 0) {
  const day = new Date(date + "T00:00");
  day.setDate(day.getDate() + offset);
  return day;
}

export function plannerRange(date: string, period: PlannerPeriod) {
  const from = plannerDay(date);
  if (period === "week") from.setDate(from.getDate() - (from.getDay() + 6) % 7);
  if (period === "month") from.setDate(1);
  const to = new Date(from);
  if (period === "month") to.setMonth(to.getMonth() + 1);
  else to.setDate(to.getDate() + (period === "week" ? 7 : 1));
  return { from, to };
}

const plannerClock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
export function plannerTime(date: string) {
  return plannerClock.format(new Date(date));
}

export function timelineDropTime(dayStart: number, dayEnd: number, drop: number, duration: number) {
  const slot = 15 * 60000;
  const lastStart = dayStart + Math.max(0, Math.floor((dayEnd - dayStart - duration) / slot)) * slot;
  const start = dayStart + Math.round((drop - dayStart) / slot) * slot;
  return Math.min(lastStart, Math.max(dayStart, start));
}

export function timelineQuarter(hourStart: number, fraction: number) {
  return hourStart + Math.max(0, Math.min(3, Math.floor(fraction * 4))) * 15 * 60000;
}

export function partnerClientAddress({ street, postal_code, city }: Pick<PrivatePartnerClient, "street" | "postal_code" | "city">) {
  return [street, [postal_code, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function hasCompletePartnerAddress({ street, postal_code, city }: Pick<PrivatePartnerClient, "street" | "postal_code" | "city">) {
  return Boolean(street.trim() && city.trim() && /^[0-9]{5}$/.test(postal_code));
}

export function partnerVisitAddress(address?: string | null) {
  const parts = address?.match(/^(?:(.*?) - )?(\d{5}) - (.+)$/);
  return parts ? { street: parts[1] ?? "", postal_code: parts[2], city: parts[3] } : null;
}

export function partnerDirections(address: string) {
  return "https://www.google.com/maps/dir/?" + new URLSearchParams({ api: "1", destination: address });
}

export function visitsOverlap(left: Times, right: Times) {
  return Date.parse(left.starts_at) < Date.parse(right.ends_at) && Date.parse(right.starts_at) < Date.parse(left.ends_at);
}
import type { PartnerWorkStatus } from "./partner-workspace";

