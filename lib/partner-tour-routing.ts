import { mapDistanceKm, plannerDate, type MapCoordinate, type PlannerMapIntervention } from "./partner-planner";

export type TourOrder = "schedule" | "proximity";
export type TourStop = PlannerMapIntervention & { startsAt: string; endsAt: string };
export type RouteLeg = { seconds: number };
export type RouteLine = [number, number][];
export type TourDrivingRoute = { legs: (RouteLeg | null)[]; lines: RouteLine[] };

export const maximumTourRouteStops = 100;

export function tourCoordinate({ latitude, longitude }: TourStop): MapCoordinate | null {
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

export function scheduledTechnicianDays(items: PlannerMapIntervention[], technicianId: string) {
  const days = new Map<string, TourStop[]>();
  for (const item of items) {
    if (!item.startsAt || !item.endsAt || item.technicianId !== technicianId) continue;
    const day = plannerDate(new Date(item.startsAt));
    const visits = days.get(day) ?? [];
    visits.push({ ...item, startsAt: item.startsAt, endsAt: item.endsAt });
    days.set(day, visits);
  }
  return days;
}

export function orderTourStops(stops: TourStop[], order: TourOrder): TourStop[] {
  const chronological = [...stops].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
  if (order === "schedule") return chronological;
  const result: TourStop[] = [];
  let located: (TourStop & MapCoordinate)[] = [];
  const finishLocatedRun = () => {
    let current = located.shift();
    while (current) {
      result.push(current);
      if (!located.length) break;
      let closest = 0;
      let distance = Infinity;
      for (const [index, candidate] of located.entries()) {
        const next = mapDistanceKm(current, candidate);
        if (next < distance) {
          closest = index;
          distance = next;
        }
      }
      [current] = located.splice(closest, 1);
    }
    located = [];
  };
  for (const stop of chronological) {
    const point = tourCoordinate(stop);
    if (point) located.push({ ...stop, ...point });
    else {
      finishLocatedRun();
      result.push(stop);
    }
  }
  finishLocatedRun();
  return result;
}

export function minutesMissingBetweenStops(previous: TourStop, next: TourStop, leg: RouteLeg | null) {
  const timeAvailable = Date.parse(next.startsAt) - Date.parse(previous.endsAt);
  return Math.max(0, Math.ceil(((leg?.seconds ?? 0) * 1000 - timeAvailable) / 60000));
}

export function tourDuration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes + " min";
  return Math.floor(minutes / 60) + " h " + String(minutes % 60).padStart(2, "0");
}
