import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { plannerDate, plannerRange, visitsOverlap } from "../lib/partner-planner";
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
  const week = plannerRange("2026-11-22", "week");
  assert.deepEqual([plannerDate(week.from), plannerDate(week.to)], ["2026-11-16", "2026-11-23"]);
  const month = plannerRange("2026-12-21", "month");
  assert.deepEqual([plannerDate(month.from), plannerDate(month.to)], ["2026-12-01", "2027-01-01"]);
});
