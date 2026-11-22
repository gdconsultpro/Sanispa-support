import { mapDistanceKm, plannerDate, type MapCoordinate, type PlannerMapIntervention } from "./partner-planner";

export type TourOrder = "schedule" | "proximity";
export type TourStop = PlannerMapIntervention & { startsAt: string; endsAt: string };
export type RouteLeg = { seconds: number };
export type RouteLine = [number, number][];
export type TourDrivingRoute = { legs: (RouteLeg | null)[]; lines: RouteLine[] };
export type TourReschedule = {
  day: string;
  technician_id: string;
  notify_clients?: boolean;
  stops: { source: "private" | "sanispa"; id: string; expected_at: string; starts_at: string }[];
};
export type TourApplyResult = { updated: number; queued: number; without_email: number };

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

export function isFixedTourStop(stop: TourStop, now: number) {
  return Boolean(stop.reschedule?.closed) || !stop.reschedule || Date.parse(stop.startsAt) <= now;
}

export function moveTourStep(stops: TourStop[], index: number, direction: -1 | 1, now: number) {
  if (isFixedTourStop(stops[index], now)) return stops;
  let target = index + direction;
  while (stops[target] && isFixedTourStop(stops[target], now)) target += direction;
  if (!stops[target]) return stops;
  const next = [...stops];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function proposeTourTimes(stops: TourStop[], travelMinutes: (number | null)[], firstStart: number, now: number) {
  let previousEnd: number | null = null;
  let previousFixed = true;
  return stops.map((stop, index) => {
    const fixed = isFixedTourStop(stop, now);
    const originalStart = Date.parse(stop.startsAt);
    const duration = Date.parse(stop.endsAt) - originalStart;
    const travel = index === 0 ? 0 : travelMinutes[index - 1];
    const arrival: number | null = index === 0 ? firstStart
      : previousEnd !== null && travel != null ? previousEnd + travel * 60000 : null;
    const startsAt: number | null = fixed ? originalStart : arrival !== null ? Math.max(firstStart, arrival) : null;
    const endsAt: number | null = startsAt !== null && Number.isFinite(startsAt) ? startsAt + duration : null;
    const missesFixedTime = fixed && index > 0 && !previousFixed && (arrival === null || arrival > originalStart);
    previousEnd = fixed && previousFixed && previousEnd !== null && endsAt !== null ? Math.max(previousEnd, endsAt) : endsAt;
    previousFixed = fixed;
    return { fixed, startsAt: endsAt === null ? null : startsAt, endsAt, missesFixedTime };
  });
}
