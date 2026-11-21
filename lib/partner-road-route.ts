import { z } from "zod";
import type { MapCoordinate } from "./partner-planner";
import type { RouteLine, TourDrivingRoute } from "./partner-tour-routing";

const routingResponse = z.object({
  timeUnit: z.literal("second"),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)])).min(2),
  }),
  portions: z.array(z.object({ duration: z.number().finite().nonnegative() })),
});

type RoutePart = { offset: number; points: MapCoordinate[] };

async function getRoadPart(points: MapCoordinate[], signal: AbortSignal) {
  const coordinates = points.map(point => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`);
  const query = new URLSearchParams({
    resource: "bdtopo-osrm", profile: "car", optimization: "fastest",
    start: coordinates[0], end: coordinates[coordinates.length - 1],
    getSteps: "false", geometryFormat: "geojson", timeUnit: "second",
  });
  if (coordinates.length > 2) query.set("intermediates", coordinates.slice(1, -1).join("|"));
  try {
    const response = await fetch("https://data.geopf.fr/navigation/itineraire?" + query, {
      cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(5500)]),
    });
    if (!response.ok) return null;
    const route = routingResponse.safeParse(await response.json());
    if (!route.success || route.data.portions.length !== points.length - 1) return null;
    return route.data;
  } catch {
    return null;
  }
}

export async function getPartnerRoadRoute(stops: (MapCoordinate | null)[], signal: AbortSignal): Promise<TourDrivingRoute> {
  const legs: TourDrivingRoute["legs"] = Array.from({ length: Math.max(0, stops.length - 1) }, () => null);
  const parts: RoutePart[] = [];
  let run: MapCoordinate[] = [];
  let offset = 0;
  for (const [index, stop] of stops.entries()) {
    if (!stop) {
      if (run.length > 1) parts.push({ offset, points: run });
      run = [];
      continue;
    }
    if (!run.length) offset = index;
    run.push(stop);
    if (run.length === 25) {
      parts.push({ offset, points: run });
      run = [stop];
      offset = index;
    }
  }
  if (run.length > 1) parts.push({ offset, points: run });

  const lines: RouteLine[] = [];
  const budget = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  const batchSize = 4;
  for (let index = 0; index < parts.length && !budget.aborted; index += batchSize) {
    const started = Date.now();
    const batch = parts.slice(index, index + batchSize);
    const results = await Promise.all(batch.map(part => getRoadPart(part.points, budget)));
    for (const [partIndex, result] of results.entries()) {
      if (!result) continue;
      const part = batch[partIndex];
      for (const [legIndex, portion] of result.portions.entries()) {
        legs[part.offset + legIndex] = { seconds: portion.duration };
      }
      lines.push(result.geometry.coordinates);
    }
    const delay = 1000 - (Date.now() - started);
    if (delay > 0 && index + batchSize < parts.length && !budget.aborted) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return { legs, lines };
}
