import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fullDatabase } from "./helpers/full-database";

test("due spa maintenance is queued once, keeps its equipment and leaves booking to the partner", async () => {
  const db = await fullDatabase();
  try {
    const [partner, other, actor, client, foreignClient, spa, secondSpa, foreignSpa] = Array.from({ length: 8 }, () => randomUUID());
    await db.query("insert into auth.users(id,email) values($1,'owner@example.invalid')", [actor]);
    await db.query("insert into partners(id,company_name,email) values($1,'Atelier','owner@example.invalid'),($2,'Autre','autre@example.invalid')", [partner, other]);
    await db.query("insert into partner_users(partner_id,user_id,role) values($1,$2,'owner')", [partner, actor]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Client','1 rue Test','68000','Colmar'),($3,$4,'Client','1 rue Test','68000','Colmar')", [partner, client, other, foreignClient]);
    await db.query("insert into partner_client_spas(partner_id,client_id,id,brand) values($1,$2,$3,'Premier'),($1,$2,$4,'Second'),($5,$6,$7,'Autre')", [partner, client, spa, secondSpa, other, foreignClient, foreignSpa]);
    await db.exec("set role service_role");
    const dates = (await db.query<{ today: string; tomorrow: string; yesterday: string }>(`select d::text today, (d+1)::text tomorrow, (d-1)::text yesterday
      from (select (now() at time zone 'Europe/Paris')::date d) as current_day`)).rows[0];
    const save = (equipment: string, due: string, active: boolean, expected: string | null, owner = client) =>
      db.query("select save_partner_spa_maintenance($1,$2,$3,$4,1,'month',$5,$6,$7)", [partner, actor, owner, equipment, due, active, expected]);
    const visits = () => db.query<{ id: string; spa_id: string; starts_at: Date | null; ends_at: Date | null; technician_id: string | null; due: string }>(
      "select id,spa_id,starts_at,ends_at,technician_id,maintenance_due_on::text due from partner_private_visits where partner_id=$1 order by maintenance_due_on,id", [partner]);
    const plan = async (equipment: string) => (await db.query<{ due: string; version: string }>(
      "select next_due_on::text due,updated_at::text version from partner_spa_maintenance where partner_id=$1 and spa_id=$2", [partner, equipment])).rows[0];
    const queue = () => db.query("select queue_partner_spa_maintenance($1)", [partner]);
    await assert.rejects(save(foreignSpa, dates.today, true, null, foreignClient), /MAINTENANCE_SPA_NOT_FOUND/);
    await save(spa, dates.yesterday, true, null);
    await save(secondSpa, dates.tomorrow, true, null);
    await queue();
    assert.ok((await plan(spa)).due > dates.today);
    assert.equal((await plan(secondSpa)).due, dates.tomorrow);
    const [first] = (await visits()).rows;
    assert.ok(first);
    assert.equal((await visits()).rows.length, 1);
    assert.deepEqual({ ...first, id: null }, {id: null, spa_id: spa, starts_at: null, ends_at: null, technician_id: null, due: dates.yesterday});
    await assert.rejects(save(spa, dates.yesterday, true, null), /MAINTENANCE_CHANGED/);
    await save(spa, dates.today, true, (await plan(spa)).version);
    await queue();
    assert.equal((await visits()).rows.length, 1);
    await db.query("update partner_private_visits set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour',completed_at=now() where id=$1", [first.id]);
    await queue();
    const [closed, following] = (await visits()).rows;
    assert.equal(closed.id, first.id);
    assert.equal(following.due, dates.today);
    assert.equal(following.spa_id, spa);
    assert.equal(following.starts_at, null);
    await save(secondSpa, dates.today, false, (await plan(secondSpa)).version);
    await queue();
    assert.equal((await visits()).rows.length, 2);
    const { rows: cadence } = await db.query(`select
      private.next_partner_maintenance_due('2027-01-31','2027-02-01',31,1,'month')::text february,
      private.next_partner_maintenance_due('2027-02-28','2027-02-28',31,1,'month')::text march,
      private.next_partner_maintenance_due('2024-02-29','2027-03-01',29,1,'year')::text leap,
      private.next_partner_maintenance_due('2027-01-04','2027-01-17',4,1,'week')::text monday`);
    assert.deepEqual(cadence, [{ february: "2027-02-28", march: "2027-03-31", leap: "2028-02-29", monday: "2027-01-18" }]);
    await db.exec("set role authenticated");
    await assert.rejects(queue(), /permission denied/);
    await assert.rejects(db.query("select * from partner_spa_maintenance"), /permission denied/);
  } finally { await db.close(); }
});
