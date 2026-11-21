import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { partnerMapPath, partnerNewClientPath, partnerVisitAddress, plannerDate, plannerRange, timelineDropTime, visitsOverlap } from "../lib/partner-planner";
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
    assert.equal((await db.query("select * from partner_private_visits where partner_id=$1", [second])).rows.length, 0);
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

test("adjacent visits do not overlap and the planner is a valid return after sign-in", () => {
  const visit = { starts_at: "2026-11-23T09:00Z", ends_at: "2026-11-23T10:00Z" };
  assert.equal(visitsOverlap(visit, { starts_at: "2026-11-23T10:00Z", ends_at: "2026-11-23T11:00Z" }), false);
  assert.equal(visitsOverlap(visit, { starts_at: "2026-11-23T09:30Z", ends_at: "2026-11-23T10:30Z" }), true);
  assert.equal(partnerReturnPath("/partenaire/planning"), "/partenaire/planning");
  assert.equal(partnerReturnPath(partnerNewClientPath), partnerNewClientPath);
  assert.equal(partnerReturnPath(partnerMapPath), partnerMapPath);
  assert.deepEqual(partnerVisitAddress("5 avenue Anatole France - 75007 - Paris"), { street: "5 avenue Anatole France", postal_code: "75007", city: "Paris" });
  assert.equal(partnerVisitAddress("Secteur 75"), null);
  const week = plannerRange("2026-11-22", "week");
  assert.deepEqual([plannerDate(week.from), plannerDate(week.to)], ["2026-11-16", "2026-11-23"]);
  const month = plannerRange("2026-12-21", "month");
  assert.deepEqual([plannerDate(month.from), plannerDate(month.to)], ["2026-12-01", "2027-01-01"]);
  const hour = 3600000;
  assert.equal(timelineDropTime(0, 24 * hour, 10.2 * hour, hour), 10.25 * hour);
  assert.equal(timelineDropTime(0, 24 * hour, 24 * hour, hour), 23 * hour);
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
