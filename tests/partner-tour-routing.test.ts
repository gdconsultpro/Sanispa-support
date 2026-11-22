import { test } from "node:test";
import assert from "node:assert/strict";
import { getPartnerRoadRoute } from "../lib/partner-road-route";
import { minutesMissingBetweenStops, moveTourStep, orderTourStops, proposeTourTimes, scheduledTechnicianDays, type TourStop } from "../lib/partner-tour-routing";
import { fullDatabase } from "./helpers/full-database";

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

test("manual order preserves locked visits and calculates the beginning and end of each future stop", () => {
  const booking = (id: string, hour: string): TourStop => ({
    ...stop(id, hour, 7.75),
    reschedule: { source: "private", id, version: "2026-11-01T09:00Z" },
  });
  const locked = booking("locked", "08");
  const first = booking("first", "10");
  const second = booking("second", "11");
  const now = Date.parse("2026-11-23T08:15Z");
  const original = [locked, first, second];
  assert.equal(moveTourStep(original, 0, 1, now), original);
  const reordered = moveTourStep(original, 2, -1, now);
  assert.deepEqual(reordered.map(stop => stop.id), ["locked", "second", "first"]);
  const newStart = Date.parse("2026-11-23T09:45Z");
  const preview = proposeTourTimes(reordered, [15, 12], newStart, now);
  assert.deepEqual(preview.map(step => new Date(step.startsAt!).toISOString()),
    ["2026-11-23T08:00:00.000Z", "2026-11-23T09:45:00.000Z", "2026-11-23T10:27:00.000Z"]);
  assert.equal(preview[2].endsAt! - preview[2].startsAt!, 30 * 60000);
  assert.equal(proposeTourTimes(reordered, [15, null], newStart, now)[2].startsAt, null);
  const closed = { ...booking("closed", "10"), reschedule: { ...first.reschedule!, closed: true } };
  assert.equal(proposeTourTimes([second, closed], [20], newStart, now)[1].missesFixedTime, true);
});

test("applying a mixed tour is atomic, keeps the original durations and rejects out-of-date or incomplete proposals", async () => {
  const db = await fullDatabase();
  const id = (number: number) => `8f15e167-e13d-4a4f-a19a-${String(number).padStart(12, "0")}`;
  const [actor, partner, technician, client, visit, customer, dossier, nextDay, otherPartner, otherActor, otherTech, oldVisit] =
    Array.from({ length: 12 }, (_, index) => id(index + 1));
  try {
    const { rows: [time] } = await db.query<{ day: string; start: string }>(`select
      ((now() at time zone 'Europe/Paris')::date + 2)::text as "day",
      (((now() at time zone 'Europe/Paris')::date + 2)::timestamp at time zone 'Europe/Paris')::text as "start"`);
    const at = (hours: number) => new Date(Date.parse(time.start) + hours * 3600000).toISOString();
    const oldStart = at(-63);
    const { rows: [{ day: previousDay }] } = await db.query<{ day: string }>(
      'select ($1::date-3)::text as "day"', [time.day]);
    await db.exec(`
      insert into auth.users(id,email) values ('${actor}','manual@example.invalid'),('${otherActor}','outside@example.invalid');
      insert into public.partners(id,company_name,email) values ('${partner}','Équipe','manual@example.invalid'),('${otherPartner}','Hors équipe','outside@example.invalid');
      insert into public.partner_users(partner_id,user_id) values ('${partner}','${actor}'),('${otherPartner}','${otherActor}');
      insert into public.partner_planning_technicians(partner_id,id,name)
        values ('${partner}','${technician}','Camille'),('${otherPartner}','${otherTech}','Robin');
      insert into public.partner_private_clients(partner_id,id,name,street,postal_code,city)
        values ('${partner}','${client}','Client QA','','','');
      insert into public.partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at,technician_id)
        values ('${partner}','${visit}','${client}','SAV','${at(9)}','${at(9.5)}','${technician}'),
          ('${partner}','${nextDay}','${client}','Mise en service','${at(24.5)}','${at(25)}','${technician}'),
          ('${partner}','${oldVisit}','${client}','Entretien','${oldStart}','${at(-62)}','${technician}');
      insert into public.customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)
        values ('${customer}','Test','0000000000','client@example.invalid','','','','exterieur','230V');
      insert into public.diagnostics(id,customer_id,problem_type,status,assigned_partner_id)
        values ('${dossier}','${customer}','fuite','ASSIGNED','${partner}');
      insert into public.partner_appointments(diagnostic_id,partner_id,starts_at,ends_at,technician_id)
        values ('${dossier}','${partner}','${at(10)}','${at(11)}','${technician}');
      set role service_role;
    `);
    const versions = await db.query<{ id: string; version: string }>(`select id,updated_at::text version
      from public.partner_private_visits union all select diagnostic_id,updated_at::text from public.partner_appointments`);
    const edit = (source: "private" | "sanispa", id: string, starts_at: string) => ({
      source, id, starts_at, expected_at: versions.rows.find(row => row.id === id)!.version,
    });
    const apply = (stops: ReturnType<typeof edit>[], onDay = time.day, who = actor, team = partner, tech = technician) =>
      db.query<{ updated: number }>("select public.apply_partner_tour($1,$2,$3,$4,$5::jsonb) updated", [team, who, tech, onDay, JSON.stringify(stops)]);
    const firstProposal = edit("private", visit, at(11.25));
    const secondProposal = edit("sanispa", dossier, at(23.75));
    await assert.rejects(apply([firstProposal, secondProposal]), /TOUR_OVERLAP/);
    assert.equal(new Date((await db.query<{ start: string }>("select starts_at::text start from public.partner_private_visits where id=$1", [visit])).rows[0].start).toISOString(), at(9));
    assert.equal((await db.query("select * from public.diagnostic_activity where event_type='appointment_scheduled'")).rows.length, 0);
    await assert.rejects(apply([firstProposal]), /TOUR_CHANGED/);
    await assert.rejects(apply([firstProposal, secondProposal], time.day, otherActor), /ASSIGNED_PARTNER_REQUIRED/);
    await assert.rejects(apply([firstProposal, secondProposal], time.day, otherActor, otherPartner, otherTech), /TOUR_CHANGED/);
    await assert.rejects(apply([edit("private", oldVisit, at(-62.5))], previousDay), /TOUR_STOP_LOCKED/);
    const successful = [edit("sanispa", dossier, at(9)), firstProposal];
    assert.equal((await apply(successful)).rows[0].updated, 2);
    await assert.rejects(apply(successful), /TOUR_CHANGED/);
    const privateRow = (await db.query("select extract(epoch from ends_at-starts_at)::integer seconds, technician_id from public.partner_private_visits where id=$1", [visit])).rows[0];
    const assignedRow = (await db.query("select extract(epoch from ends_at-starts_at)::integer seconds, technician_id from public.partner_appointments where diagnostic_id=$1", [dossier])).rows[0];
    assert.deepEqual(privateRow, { seconds: 1800, technician_id: technician });
    assert.deepEqual(assignedRow, { seconds: 3600, technician_id: technician });
    assert.equal((await db.query("select * from public.diagnostic_activity where event_type='appointment_scheduled'")).rows.length, 1);
    assert.equal((await db.query("select * from public.notification_jobs")).rows.length, 0);

    await db.query("update public.partner_private_clients set email='tour-customer@example.invalid' where id=$1", [client]);
    const latest = await db.query<{ id: string; version: string }>(`select id,updated_at::text version
      from public.partner_private_visits union all select diagnostic_id,updated_at::text from public.partner_appointments`);
    const notify = (steps: ReturnType<typeof edit>[]) => db.query<{ result: { updated: number; queued: number; without_email: number } }>(
      "select public.apply_partner_tour_and_queue($1,$2,$3,$4,$5::jsonb,$6) result",
      [partner, actor, technician, time.day, JSON.stringify(steps), id(20)],
    );
    const updatedPlan = [edit("sanispa", dossier, at(9)), edit("private", visit, at(12))].map(step => ({
      ...step, expected_at: latest.rows.find(row => row.id === step.id)!.version,
    }));
    await assert.rejects(notify([{ ...updatedPlan[0], starts_at: at(11.5) }, updatedPlan[1]]), /TOUR_OVERLAP/);
    assert.equal((await db.query("select * from public.notification_jobs")).rows.length, 0);
    const result = await notify(updatedPlan);
    assert.deepEqual(result.rows[0].result, { updated: 1, queued: 1, without_email: 0 });
    const { rows: [job] } = await db.query<{ kind: string; key: string; first_delivery_attempt_at: string; payload: Record<string, string> }>(
      "select * from public.claim_notifications($1)", ["tour-slot:" + id(20) + ":"]);
    assert.equal(job.kind, "tour_slot_changed");
    assert.equal(job.key, "tour-slot:" + id(20) + ":private:" + visit);
    assert.equal(job.payload.appointmentId, visit);
    assert.equal(job.payload.partnerId, partner);
    assert.equal(Object.hasOwn(job.payload, "email"), false);
    assert.equal(new Date(job.payload.startsAt).toISOString(), at(12));
    assert.equal(new Date(job.payload.endsAt).toISOString(), at(12.5));
    assert.ok(job.first_delivery_attempt_at);
    assert.equal((await db.query("select * from public.claim_notifications($1)", ["tour-slot:"])).rows.length, 0);
  } finally {
    await db.close();
  }
});
