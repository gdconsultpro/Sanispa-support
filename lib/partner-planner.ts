export type PrivatePartnerClient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  street: string;
  postal_code: string;
  city: string;
  intervention_type: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  source_diagnostic_id: string | null;
};

type Times = { starts_at: string; ends_at: string };
type ScheduledVisit = Times & { technician_id: string | null; updated_at: string };
type MapPosition = { latitude?: number | null; longitude?: number | null; approximateLocation?: boolean };
export type PrivatePartnerVisit = ScheduledVisit & {
  id: string;
  title: string;
  description: string;
  client: PrivatePartnerClient;
} & MapPosition;
export type PendingPrivatePartnerVisit = Omit<PrivatePartnerVisit, "starts_at" | "ends_at"> & {
  starts_at: null;
  ends_at: null;
};
export type SanispaPartnerVisit = ScheduledVisit & MapPosition & {
  diagnostic_id: string;
  diagnostic: { problem_type: string; status: string; customer: { name: string | null; address: string | null } | null };
};

export type PlannerTechnician = { id: string; name: string };
export type PlannerSlot = { startsAt: string; technicianId: string | null };
export type PlannerAppointment = ScheduledVisit & {
  id: string;
  title: string;
  source: "private" | "sanispa";
  movable: boolean;
};

export const interventionTypes = ["Intervention SAV", "Mise en service", "Installation", "Entretien / révision"];
export const partnerClientsPath = "/partenaire/planning?view=clients";
export const partnerNewClientPath = partnerClientsPath + "&ajouter=1";
export const partnerMapPath = "/partenaire/planning?view=carte";
export const partnerNewVisitPath = "/partenaire/planning?nouvelle=1";

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
};

export type PendingPartnerDossier = MapPosition & {
  id: string;
  problem_type: string;
  status: string;
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
    if (item.startsAt || !hasMapCoordinates(item) ||
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

export type PlannerMapStatus = "scheduled" | "pending" | "upcoming";

export function matchesPlannerMapFilters(item: Pick<PlannerMapIntervention, "startsAt" | "technicianId">,
  status: PlannerMapStatus, technician: string) {
  return (status === "upcoming" || (status === "scheduled") === Boolean(item.startsAt)) &&
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

export function plannerTime(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
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
