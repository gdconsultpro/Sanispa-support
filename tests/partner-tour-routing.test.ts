import { test } from "node:test";
import assert from "node:assert/strict";
import { getPartnerRoadRoute } from "../lib/partner-road-route";
import { minutesMissingBetweenStops, orderTourStops, scheduledTechnicianDays, type TourStop } from "../lib/partner-tour-routing";

function stop(id: string, hour: string, longitude: number | null, technicianId = "camille"): TourStop {
  return {
    id, title: id, address: "", technicianId, latitude: longitude === null ? null : 48.58, longitude,
    startsAt: `2026-11-23T${hour}:00Z`, endsAt: `2026-11-23T${hour}:30Z`,
  };
}

test("the proposed order starts with the first booking and keeps unlocated or other technicians' visits out of the rearrangement", () => {
  const a = stop("a", "09", 7.75), b = stop("b", "10", 7.81), c = stop("c", "11", 7.77);
  const unknown = stop("unknown", "12", null), next = stop("next", "13", 7.69);
  const items = [next, b, a, unknown, c, stop("other", "08", 7.78, "noe"), { ...c, id: "pending", startsAt: null }];
  const days = scheduledTechnicianDays(items, "camille");
  assert.equal(days.size, 1);
  const scheduled = [...days.values()][0];
  assert.deepEqual(orderTourStops(scheduled, "schedule").map(item => item.id), ["a", "b", "c", "unknown", "next"]);
  assert.deepEqual(orderTourStops(scheduled, "proximity").map(item => item.id), ["a", "c", "b", "unknown", "next"]);
  assert.equal(minutesMissingBetweenStops(a, b, { seconds: 1830 }), 1);
  assert.equal(minutesMissingBetweenStops(a, b, { seconds: 1800 }), 0);
});

test("the road service returns per-leg timings and leaves a gap when an address is missing", async context => {
  const fetchMock = context.mock.method(globalThis, "fetch", async (input: URL | string | Request) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "data.geopf.fr");
    const points = [url.searchParams.get("start"), ...(url.searchParams.get("intermediates")?.split("|") ?? []), url.searchParams.get("end")];
    return Response.json({
      timeUnit: "second", distanceUnit: "meter",
      geometry: { type: "LineString", coordinates: points.map(point => point?.split(",").map(Number)) },
      portions: points.slice(1).map((_, i) => ({ duration: 300 + i * 60, distance: 2100 + i * 10 })),
    });
  });
  const point = (longitude: number) => ({ longitude, latitude: 48.58 });
  const route = await getPartnerRoadRoute(
    [point(7.7), point(7.8), point(7.9), null, point(7.6), point(7.5)], new AbortController().signal,
  );
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.deepEqual(route.legs.map(leg => leg?.seconds ?? null), [300, 360, null, null, 300]);
  assert.deepEqual(route.lines, [[[7.7, 48.58], [7.8, 48.58], [7.9, 48.58]], [[7.6, 48.58], [7.5, 48.58]]]);
});

test("failed or mismatched road results leave durations unavailable", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({
    timeUnit: "hour", distanceUnit: "meter", portions: [{ duration: 0.5, distance: 1000 }],
    geometry: { type: "LineString", coordinates: [[7.7, 48.58], [7.8, 48.58]] },
  }));
  const response = await getPartnerRoadRoute(
    [{ latitude: 48.58, longitude: 7.7 }, { latitude: 48.58, longitude: 7.8 }], new AbortController().signal,
  );
  assert.deepEqual(response, { legs: [null], lines: [] });
});
