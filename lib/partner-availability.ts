export type InterventionDuration = { label: string; duration_minutes: number };
export type WeeklyHours = { weekday: number; start: string; end: string };
export type TechnicianAbsence = { id: string; starts_at: string; ends_at: string; label: string };
export type TechnicianAvailability = {
  id: string;
  name: string;
  hours: WeeklyHours[] | null;
  absences: TechnicianAbsence[];
};
export type AvailableSlot = { technician_id: string; technician_name: string; starts_at: string; ends_at: string };
export type PlanningResources = { durations: InterventionDuration[]; customizedTypes: string[]; team: TechnicianAvailability[]; canManage: boolean };
export const planningResourcesPath = "/api/partner/planning/resources";

const savType = "Intervention SAV";
const movingType = "Déménagement de spa";
export const defaultInterventionDurations: InterventionDuration[] = [
  { label: savType, duration_minutes: 60 },
  { label: "Mise en service", duration_minutes: 90 },
  { label: "Installation", duration_minutes: 120 },
  { label: "Entretien / révision", duration_minutes: 90 },
  { label: movingType, duration_minutes: 120 },
];

export const planningTypeKey = (label: string) => label.trim().normalize("NFC").toLocaleLowerCase("fr-FR");

export function schedulingDuration(type: string, durations: InterventionDuration[], fallback = 60) {
  const key = planningTypeKey(type);
  return durations.find(item => planningTypeKey(item.label) === key)?.duration_minutes ?? fallback;
}

export function sanispaSchedulingType(problem: string) {
  return problem === "demenagement" ? movingType : savType;
}

export function planningDurations(overrides: InterventionDuration[]) {
  const entries = new Map(defaultInterventionDurations.map(item => [planningTypeKey(item.label), item]));
  for (const item of overrides) entries.set(planningTypeKey(item.label), { ...item, label: entries.get(planningTypeKey(item.label))?.label ?? item.label });
  return [...entries.values()];
}

export const defaultTechnicianHours: WeeklyHours[] = Array.from({ length: 5 }, (_, index) => ({
  weekday: index + 1, start: "08:00", end: "18:00",
}));

const parisClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function planningLocalParts(value: string) {
  const [day, time] = parisClock.format(new Date(value)).split(" ");
  return { day, time };
}

export function parisDateTime(value: string) {
  const target = Date.parse(value + "Z");
  if (!Number.isFinite(target)) throw new Error("Indiquez une date et une heure valides.");
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = planningLocalParts(new Date(instant).toISOString());
    const displayed = local.day + "T" + local.time;
    if (displayed === value) return new Date(instant).toISOString();
    instant += target - Date.parse(displayed + "Z");
  }
  throw new Error("Cette heure n’existe pas le jour du changement d’heure. Choisissez une autre heure.");
}
