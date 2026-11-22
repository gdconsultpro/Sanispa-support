import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { matchesPlannerMapFilters, nearbyPendingVisits, partnerMapPath, partnerNewClientPath, partnerNewVisitPath, partnerVisitAddress, partnerVisitMapPath, plannerDate, plannerRange, suggestedTourStart, timelineDropTime, timelineQuarter, visitsOverlap, type PlannerMapIntervention } from "../lib/partner-planner";
import { partnerReturnPath } from "../lib/partner-navigation";

test("private visits can only reference a client in the same partner company", async () => {
  const db = await fullDatabase();
  const first = "73609339-6d8b-41d5-ac6e-c6d8503ef369";
  const second = "73609339-6d8b-41d5-ac6e-c6d8503ef370";
  const client = "73609339-6d8b-41d5-ac6e-c6d8503ef371";
  const visit = "73609339-6d8b-41d5-ac6e-c6d8503ef372";
  try {
    await db.query("insert into partners(id,company_name,email) values($1,'Entreprise A','a@example.invalid'),($2,'Entreprise B','b@example.invalid')", [first, second]);
    await db.query(`insert into partner_private_clients(partner_id,id,name,street,postal_code,city)
      values($1,$2,'Client privé','Rue de test','67000','Strasbourg')`, [first, client]);
    const schedule = `insert into partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at)
      values($1,$2,$3,'Entretien','2026-11-23T09:00Z','2026-11-23T10:00Z')`;
    await assert.rejects(db.query(schedule, [second, visit, client]), /foreign key constraint/);
    await db.query(schedule, [first, visit, client]);
    await assert.rejects(db.query("update partner_private_visits set ends_at=null where id=$1", [visit]), /partner_private_visits_schedule_pair/);
    await db.query("update partner_private_visits set starts_at=null, ends_at=null where id=$1", [visit]);
    assert.equal((await db.query("select id from partner_private_visits where partner_id=$1 and starts_at is null", [first])).rows.length, 1);
    assert.equal((await db.query("select id from partner_private_visits where partner_id=$1", [second])).rows.length, 0);
    assert.equal((await db.query("select * from partner_appointments")).rows.length, 0);
    assert.equal((await db.query("select * from synchroteam_exports")).rows.length, 0);
    for (const actor of ["anon", "authenticated"]) {
      for (const table of ["partner_private_clients", "partner_private_visits", "partner_private_stock"]) {
        const {rows: [permissions]} = await db.query<{read: boolean; write: boolean}>(
          "select has_table_privilege($1,$2,'SELECT') as read, has_table_privilege($1,$2,'INSERT') as write", [actor, table],
        );
        assert.deepEqual(permissions, { read: false, write: false });
      }
    }
  } finally {
    await db.close();
  }
});

test("map filters keep interventions without a date separate from scheduled appointments", () => {
  const dated = { startsAt: "2026-11-23T09:00Z", technicianId: "camille" };
  const awaiting = { startsAt: null, technicianId: "camille" };
  const unassigned = { startsAt: null, technicianId: null };
  assert.equal(matchesPlannerMapFilters(dated, "scheduled", "camille"), true);
  assert.equal(matchesPlannerMapFilters(dated, "pending", "camille"), false);
  assert.equal(matchesPlannerMapFilters(awaiting, "pending", "camille"), true);
  assert.equal(matchesPlannerMapFilters(awaiting, "pending", ""), false);
  assert.equal(matchesPlannerMapFilters(unassigned, "pending", ""), true);
  assert.equal(matchesPlannerMapFilters(unassigned, "pending", "all"), true);
  assert.equal(matchesPlannerMapFilters(dated, "pending", "other-technician"), false);
  assert.equal(matchesPlannerMapFilters(dated, "pending", "all"), false);
  assert.equal(matchesPlannerMapFilters(unassigned, "scheduled", "all"), false);
});

test("tour suggestions rank nearby pending visits and keep another technician's work out of the tour", () => {
  const anchor: PlannerMapIntervention = {
    id: "anchor", title: "Rendez-vous", address: "", startsAt: "2026-11-23T09:00Z", endsAt: "2026-11-23T10:10Z",
    technicianId: "camille", latitude: 48.58, longitude: 7.75,
  };
  const near = { ...anchor, startsAt: null, latitude: 48.6, id: "near", technicianId: null };
  const further = { ...near, latitude: 48.66, id: "further", technicianId: "camille" };
  const other = { ...near, id: "other", technicianId: "alice" };
  const far = { ...near, id: "far", latitude: 49 };
  const unmapped = { ...near, id: "unmapped", latitude: null };
  const items = [further, anchor, other, unmapped, far, near];
  const suggestions = nearbyPendingVisits(anchor, items, 25);
  assert.deepEqual(suggestions.map(({ item }) => item.id), ["near", "further"]);
  assert.ok(suggestions[0].distance > 2 && suggestions[0].distance < 3);
  assert.deepEqual(nearbyPendingVisits(anchor, items, 1), []);
  assert.equal(nearbyPendingVisits({ ...anchor, technicianId: null }, items, 25).length, 3);
  const now = new Date("2026-11-21T21:00Z");
  assert.equal(suggestedTourStart(anchor.endsAt!, [], now).toISOString(), "2026-11-23T10:45:00.000Z");
  assert.equal(suggestedTourStart(anchor.endsAt!, [
    { startsAt: "2026-11-23T11:30Z", endsAt: "2026-11-23T12:00Z" },
    { startsAt: "2026-11-23T12:10Z", endsAt: "2026-11-23T12:45Z" },
  ], now).toISOString(), "2026-11-23T13:15:00.000Z");
});

test("adjacent visits do not overlap and the planner is a valid return after sign-in", () => {
  const visit = { starts_at: "2026-11-23T09:00Z", ends_at: "2026-11-23T10:00Z" };
  assert.equal(visitsOverlap(visit, { starts_at: "2026-11-23T10:00Z", ends_at: "2026-11-23T11:00Z" }), false);
  assert.equal(visitsOverlap(visit, { starts_at: "2026-11-23T09:30Z", ends_at: "2026-11-23T10:30Z" }), true);
  assert.equal(partnerReturnPath("/partenaire/planning"), "/partenaire/planning");
  assert.equal(partnerReturnPath(partnerNewClientPath), partnerNewClientPath);
  assert.equal(partnerReturnPath(partnerMapPath), partnerMapPath);
  assert.equal(partnerReturnPath(partnerNewVisitPath), partnerNewVisitPath);
  const job = "73609339-6d8b-41d5-ac6e-c6d8503ef369";
  const waitingPath = partnerVisitMapPath(job, null);
  const scheduledPath = partnerVisitMapPath(job, visit.starts_at);
  assert.equal(waitingPath, partnerMapPath + "&visite=" + job + "&statut=pending");
  assert.equal(scheduledPath, partnerMapPath + "&visite=" + job + "&jour=" + plannerDate(new Date(visit.starts_at)));
  assert.equal(partnerReturnPath(waitingPath), waitingPath);
  assert.equal(partnerReturnPath(scheduledPath), scheduledPath);
  assert.equal(partnerReturnPath(scheduledPath + "&retour=https://example.invalid"), "/partenaire/leads");
  assert.deepEqual(partnerVisitAddress("5 avenue Anatole France - 75007 - Paris"), { street: "5 avenue Anatole France", postal_code: "75007", city: "Paris" });
  assert.equal(partnerVisitAddress("Secteur 75"), null);
  const week = plannerRange("2026-11-22", "week");
  assert.deepEqual([plannerDate(week.from), plannerDate(week.to)], ["2026-11-16", "2026-11-23"]);
  const month = plannerRange("2026-12-21", "month");
  assert.deepEqual([plannerDate(month.from), plannerDate(month.to)], ["2026-12-01", "2027-01-01"]);
  const hour = 3600000;
  assert.equal(timelineDropTime(0, 24 * hour, 10.2 * hour, hour), 10.25 * hour);
  assert.equal(timelineDropTime(0, 24 * hour, 24 * hour, hour), 23 * hour);
  assert.equal(timelineQuarter(10 * hour, 0.26), 10.25 * hour);
  assert.equal(timelineQuarter(10 * hour, 0.74), 10.5 * hour);
  assert.equal(timelineQuarter(10 * hour, 1), 10.75 * hour);
});

test("moving a private or assigned visit preserves its duration and rejects stale or foreign changes", async () => {
  const db = await fullDatabase();
  const id = (n: number) => `e541ef0c-b9ce-486f-be19-${String(n).padStart(12, "0")}`;
  const partner = id(1), other = id(2), actor = id(3), outsider = id(4), technician = id(5), foreignTechnician = id(6);
  const privateClient = id(7), privateVisit = id(8), customer = id(9), dossier = id(10);
  try {
    await db.exec(`
      insert into auth.users(id,email) values ('${actor}','actor@example.invalid'),('${outsider}','other@example.invalid');
      insert into public.partners(id,company_name,email) values ('${partner}','A','actor@example.invalid'),('${other}','B','other@example.invalid');
      insert into public.partner_users(partner_id,user_id) values ('${partner}','${actor}'),('${other}','${outsider}');
      insert into public.partner_planning_technicians(partner_id,id,name) values ('${partner}','${technician}','Alice'),('${other}','${foreignTechnician}','Robin');
      insert into public.partner_private_clients(partner_id,id,name,street,postal_code,city) values ('${partner}','${privateClient}','Client privé','','','');
      insert into public.partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at)
        values ('${partner}','${privateVisit}','${privateClient}','SAV',now(),now()+interval '45 minutes');
      insert into public.customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)
        values ('${customer}','Test','0000000000','client@example.invalid','','','','exterieur','230V');
      insert into public.diagnostics(id,customer_id,problem_type,status,assigned_partner_id)
        values ('${dossier}','${customer}','fuite','ASSIGNED','${partner}');
      insert into public.partner_appointments(diagnostic_id,partner_id,starts_at,ends_at)
        values ('${dossier}','${partner}',now(),now()+interval '90 minutes');
      set role service_role;
    `);
    const move = "select public.move_partner_planned_appointment($1,$2,$3,$4,$5,now()+interval '2 days',$6)";
    const privateVersion = (await db.query<{version:string}>("select updated_at::text version from partner_private_visits where id=$1", [privateVisit])).rows[0].version;
    const assignedVersion = (await db.query<{version:string}>("select updated_at::text version from partner_appointments where diagnostic_id=$1", [dossier])).rows[0].version;
    await assert.rejects(db.query(move, [partner, actor, "private", privateVisit, privateVersion, foreignTechnician]), /TECHNICIAN_NOT_FOUND/);
    await assert.rejects(db.query(move, [other, outsider, "sanispa", dossier, assignedVersion, foreignTechnician]), /ASSIGNED_PARTNER_REQUIRED/);
    await db.query(move, [partner, actor, "private", privateVisit, privateVersion, technician]);
    await db.query(move, [partner, actor, "sanispa", dossier, assignedVersion, technician]);
    await assert.rejects(db.query(move, [partner, actor, "private", privateVisit, privateVersion, null]), /APPOINTMENT_CHANGED/);
    const privateResult = await db.query("select technician_id, (extract(epoch from ends_at-starts_at)/60)::int minutes from partner_private_visits where id=$1", [privateVisit]);
    assert.deepEqual(privateResult.rows, [{ technician_id: technician, minutes: 45 }]);
    const assignedResult = await db.query("select technician_id, (extract(epoch from ends_at-starts_at)/60)::int minutes from partner_appointments where diagnostic_id=$1", [dossier]);
    assert.deepEqual(assignedResult.rows, [{ technician_id: technician, minutes: 90 }]);
    await db.query("select save_partner_appointment($1,$2,$3,now()+interval '3 days',now()+interval '3 days 1 hour')", [dossier, partner, actor]);
    const rescheduled = await db.query("select technician_id from partner_appointments where diagnostic_id=$1", [dossier]);
    assert.deepEqual(rescheduled.rows, [{ technician_id: technician }]);
  } finally {
    await db.close();
  }
});

test("tour bookings schedule the existing intervention and reject occupied slots and non-assigned cases", async () => {
  const db = await fullDatabase();
  const id = (n: number) => `960d4832-5d23-420f-914e-${String(n).padStart(12, "0")}`;
  const partner = id(1), other = id(2), actor = id(3), technician = id(4), otherTech = id(5);
  const client = id(6), visit = id(7), customer = id(8), assigned = id(9), offered = id(10), busy = id(11);
  try {
    await db.exec(`
      insert into auth.users(id,email) values ('${actor}','tour@example.invalid');
      insert into public.partners(id,company_name,email) values ('${partner}','A','tour@example.invalid'),('${other}','B','other@example.invalid');
      insert into public.partner_users(partner_id,user_id) values ('${partner}','${actor}');
      insert into public.partner_planning_technicians(partner_id,id,name)
        values ('${partner}','${technician}','Camille'),('${other}','${otherTech}','Robin');
      insert into public.partner_private_clients(partner_id,id,name,street,postal_code,city) values ('${partner}','${client}','Client privé','','','');
      insert into public.partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at,technician_id)
        values ('${partner}','${visit}','${client}','SAV',null,null,null),
        ('${partner}','${busy}','${client}','Entretien',date_trunc('day',now())+interval '2 days 9 hours',date_trunc('day',now())+interval '2 days 10 hours','${technician}');
      insert into public.customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)
        values ('${customer}','Test','0000000000','client@example.invalid','','','','exterieur','230V');
      insert into public.diagnostics(id,customer_id,problem_type,status,assigned_partner_id)
        values ('${assigned}','${customer}','fuite','ASSIGNED','${partner}'), ('${offered}','${customer}','fuite','AVAILABLE',null);
      set role service_role;
    `);
    const book = `select public.book_partner_tour_visit($1,$2,$3,$4,$5,date_trunc('day',now())+interval '2 days'+$6::interval,
      date_trunc('day',now())+interval '2 days 1 hour'+$6::interval,$7)`;
    const { rows: [row] } = await db.query<{ version: string }>("select updated_at::text version from partner_private_visits where id=$1", [visit]);
    await assert.rejects(db.query(book, [partner, actor, "private", visit, row.version, "9 hours", technician]), /TECHNICIAN_SLOT_OCCUPIED/);
    await assert.rejects(db.query(book, [partner, actor, "private", visit, row.version, "10 hours", otherTech]), /TECHNICIAN_NOT_FOUND/);
    await assert.rejects(db.query(book, [partner, actor, "sanispa", offered, null, "10 hours", technician]), /ASSIGNED_PARTNER_REQUIRED/);
    await db.query(book, [partner, actor, "sanispa", assigned, null, "10 hours", technician]);
    await assert.rejects(db.query(book, [partner, actor, "private", visit, row.version, "10 hours", technician]), /TECHNICIAN_SLOT_OCCUPIED/);
    await db.query(book, [partner, actor, "private", visit, row.version, "11 hours", technician]);
    await assert.rejects(db.query(book, [partner, actor, "private", visit, row.version, "12 hours", technician]), /APPOINTMENT_CHANGED/);
    await assert.rejects(db.query(book, [partner, actor, "sanispa", assigned, null, "12 hours", technician]), /APPOINTMENT_CHANGED/);
    assert.deepEqual((await db.query("select id, technician_id from partner_private_visits where id=$1 and starts_at is not null", [visit])).rows,
      [{ id: visit, technician_id: technician }]);
    assert.deepEqual((await db.query("select technician_id from partner_appointments where diagnostic_id=$1", [assigned])).rows, [{ technician_id: technician }]);
    assert.equal((await db.query("select * from synchroteam_exports")).rows.length, 0);
  } finally {
    await db.close();
  }
});
