import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { partnerDayPath, partnerDayRange } from "../lib/partner-day";
import { partnerLoginDestination, partnerReturnPath } from "../lib/partner-navigation";
import { fullDatabase } from "./helpers/full-database";

test("the technician's day follows Paris midnight across both daylight saving transitions", () => {
  assert.deepEqual(partnerDayRange(new Date("2027-03-28T15:00:00Z")), {
    day: "2027-03-28", from: "2027-03-27T23:00:00.000Z", to: "2027-03-28T22:00:00.000Z",
  });
  assert.deepEqual(partnerDayRange(new Date("2027-10-31T15:00:00Z")), {
    day: "2027-10-31", from: "2027-10-30T22:00:00.000Z", to: "2027-10-31T23:00:00.000Z",
  });
  assert.equal(partnerReturnPath(partnerDayPath), partnerDayPath);
  assert.equal(partnerLoginDestination(null, "technician"), partnerDayPath);
  assert.equal(partnerLoginDestination(null, "owner"), "/partenaire/compte");
  assert.equal(partnerLoginDestination("/partenaire/compte", "technician"), "/partenaire/compte");
});

test("only the partner owner can link a registered technician to a line of the same company", async () => {
  const db = await fullDatabase();
  try {
    const [partner, other, admin, owner, first, second, foreign, alice, bob, lineOutside] = Array.from({ length: 10 }, () => randomUUID());
    for (const id of [admin, owner, first, second, foreign])
      await db.query("insert into auth.users(id,email) values($1,$2)", [id, id + "@example.invalid"]);
    await db.query("insert into public.admin_users(user_id,active) values($1,true)", [admin]);
    await db.query("insert into public.partners(id,company_name,email) values($1,'Test','one@example.invalid'),($2,'Test 2','two@example.invalid')", [partner, other]);
    await db.query("insert into public.partner_planning_technicians(partner_id,id,name) values($1,$2,'Alice'),($1,$3,'Bob'),($4,$5,'Bavarde')", [partner, alice, bob, other, lineOutside]);
    await db.exec("set role service_role");
    const adminLink = "select public.link_partner_account($1,$2,$3,$4,false,$5)";
    await db.query("select public.link_partner_account($1,$2,$3,'Responsable')", [partner, owner, admin]);
    await db.query(adminLink, [partner, first, admin, "Alice", "technician"]);
    await db.query(adminLink, [partner, second, admin, "Bob", "technician"]);
    await db.query(adminLink, [other, foreign, admin, "Autre", "technician"]);
    await db.query(adminLink, [partner, owner, admin, "Responsable", "technician"]);
    assert.equal((await db.query<{ role: string }>("select role from partner_users where user_id=$1", [owner])).rows[0].role, "owner");
    await assert.rejects(db.query(adminLink, [other, second, admin, "Bob", "technician"]), /ACCOUNT_LINKED_ELSEWHERE/);
    await assert.rejects(db.query(adminLink, [partner, admin, owner, "Test", "technician"]), /ADMIN_REQUIRED/);
    const link = (actor: string, user: string, line: string | null, expected: string | null = null) =>
      db.query("select set_partner_technician_account($1,$2,$3,$4,$5)", [partner, actor, user, line, expected]);
    await assert.rejects(link(first, first, alice), /PARTNER_OWNER_REQUIRED/);
    await assert.rejects(link(owner, foreign, alice), /TECHNICIAN_ACCOUNT_REQUIRED/);
    await assert.rejects(link(owner, first, lineOutside), /partner_user_technician_fk/);
    await link(owner, first, alice);
    await link(owner, first, alice);
    await assert.rejects(link(owner, second, alice), /partner_users_one_account_per_technician/);
    await assert.rejects(link(owner, first, bob), /TECHNICIAN_LINK_CHANGED/);
    await link(owner, second, bob);
    await link(owner, first, null, alice);
    assert.deepEqual((await db.query("select technician_id from partner_users where user_id=$1", [first])).rows, [{ technician_id: null }]);
    await db.exec("set role authenticated");
    await assert.rejects(link(owner, first, alice), /permission denied/);
  } finally { await db.close(); }
});
