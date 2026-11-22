import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parisDateTime, planningDurations, sanispaSchedulingType, schedulingDuration } from "../lib/partner-availability";
import { fullDatabase } from "./helpers/full-database";

test("custom durations follow intervention types, with stable defaults and Paris local time", () => {
  const catalogue = planningDurations([{ label: " installation ", duration_minutes: 145 }, { label: "Dépose", duration_minutes: 40 }]);
  assert.equal(schedulingDuration("Installation", catalogue), 145);
  assert.equal(schedulingDuration("Dépose", catalogue), 40);
  assert.equal(schedulingDuration(sanispaSchedulingType("fuite"), catalogue), 60);
  assert.equal(schedulingDuration(sanispaSchedulingType("demenagement"), catalogue), 120);
  assert.equal(parisDateTime("2027-01-04T08:00"), "2027-01-04T07:00:00.000Z");
  assert.equal(parisDateTime("2027-07-05T08:00"), "2027-07-05T06:00:00.000Z");
  assert.throws(() => parisDateTime("2027-03-28T02:30"), /changement d’heure/);
});

test("slot suggestions consider working blocks, absences and both appointment sources, and bookings recheck at commit", async () => {
  const db = await fullDatabase();
  try {
    const [partner, other, technician, outsider, client, customer, dossier, first, second] = Array.from({ length: 9 }, () => randomUUID());
    await db.query("insert into partners(id,company_name,contact_name,email) values($1,'Entreprise','Contact','planning@example.invalid'),($2,'Autre','Contact','autre@example.invalid')", [partner, other]);
    await db.query("insert into partner_planning_technicians(partner_id,id,name) values($1,$2,'Alex'),($3,$4,'Léa')", [partner, technician, other, outsider]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Client','10 rue du Test','67000','Strasbourg')", [partner, client]);
    await db.query("insert into customers(id,name,phone,email,address,spa_brand,spa_model,spa_year,installation_type,power_supply) values($1,'Client','0600000000','client@example.invalid','Strasbourg','Spa test','S1','2024','exterieur','230V')", [customer]);
    await db.query("insert into diagnostics(id,customer_id,problem_type,choice,status,assigned_partner_id) values($1,$2,'fuite','intervention','ASSIGNED',$3)", [dossier, customer, partner]);
    const monday = (await db.query<{ day: string }>("select (date_trunc('week', now() at time zone 'Europe/Paris')::date + 14)::text as day")).rows[0].day;
    const at = (time: string) => parisDateTime(monday + "T" + time);
    await db.exec("set role service_role");
    await db.query("insert into partner_technician_workweeks values($1,$2,$3)",
      [partner, technician, JSON.stringify([{ weekday: 1, start: "08:00", end: "12:00" }, { weekday: 1, start: "13:00", end: "17:00" }])]);
    await db.query("insert into partner_technician_absences values($1,$2,gen_random_uuid(),$3,$4,'Formation')",
      [partner, technician, at("08:00"), at("09:00")]);
    const privateVisit = (id: string, start: string, end: string) => db.query(
      "insert into partner_private_visits(partner_id,id,client_id,title,technician_id,starts_at,ends_at) values($1,$2,$3,'Entretien',$4,$5,$6)",
      [partner, id, client, technician, at(start), at(end)]);
    await privateVisit(first, "09:00", "10:00");
    await db.query("insert into partner_appointments(diagnostic_id,partner_id,technician_id,starts_at,ends_at) values($1,$2,$3,$4,$5)",
      [dossier, partner, technician, at("10:00"), at("11:00")]);
    const suggestions = (member: string) => db.query<{ starts_at: Date; ends_at: Date; technician_id: string }>(
      "select * from suggest_partner_appointment_slots($1,$2,$3,90,null)", [partner, member, monday]);
    const slots = (await suggestions(technician)).rows;
    assert.equal(slots[0].starts_at.toISOString(), at("13:00"));
    assert.equal(slots[0].ends_at.toISOString(), at("14:30"));
    assert.ok(slots.every(slot => slot.technician_id === technician));
    assert.equal((await suggestions(outsider)).rows.length, 0);
    await assert.rejects(privateVisit(second, "11:30", "13:00"), /TECHNICIAN_OUTSIDE_HOURS/);
    await assert.rejects(privateVisit(second, "08:30", "09:00"), /TECHNICIAN_ABSENT/);
    await assert.rejects(privateVisit(second, "10:30", "11:30"), /TECHNICIAN_SLOT_OCCUPIED/);
    await privateVisit(second, "13:00", "14:30");
    assert.equal((await suggestions(technician)).rows[0].starts_at.toISOString(), at("14:30"));
    await assert.rejects(db.query("update partner_appointments set starts_at=$1,ends_at=$2 where diagnostic_id=$3",
      [at("13:30"), at("14:30"), dossier]), /TECHNICIAN_SLOT_OCCUPIED/);
    await db.transaction(async transaction => {
      // Moving two visits in one tour can overlap intermediate values but not the committed schedule.
      await transaction.query("update partner_private_visits set starts_at=$1, ends_at=$2 where id=$3", [at("13:30"), at("14:30"), first]);
      await transaction.query("update partner_private_visits set starts_at=$1, ends_at=$2 where id=$3", [at("09:00"), at("10:00"), second]);
    });
    await db.exec("set role authenticated");
    await assert.rejects(suggestions(technician), /permission denied/);
    await assert.rejects(db.query("select * from partner_technician_absences"), /permission denied/);
  } finally { await db.close(); }
});
