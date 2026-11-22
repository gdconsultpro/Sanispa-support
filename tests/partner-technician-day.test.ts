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
    const lookup = "select find_admin_partner_account($1,$2) as account";
    assert.equal((await db.query<{account: {id: string}}>(lookup, [admin, first + "@EXAMPLE.INVALID"])).rows[0].account.id, first);
    assert.equal((await db.query<{account: unknown}>(lookup, [admin, "missing@example.invalid"])).rows[0].account, null);
    await assert.rejects(db.query(lookup, [owner, first + "@example.invalid"]), /ADMIN_REQUIRED/);
    await db.query("select public.link_partner_account($1,$2,$3,'Responsable')", [partner, owner, admin]);
    const firstLink = await db.query(adminLink, [partner, first, admin, "Alice", "technician"]);
    assert.deepEqual((await db.query(adminLink, [partner, first, admin, "Alice", "technician"])).rows, firstLink.rows);
    await db.query(adminLink, [partner, second, admin, "Bob", "technician"]);
    await db.query(adminLink, [other, foreign, admin, "Autre", "technician"]);
    await assert.rejects(db.query(adminLink, [partner, owner, admin, "Responsable", "technician"]), /PARTNER_ROLE_CONFLICT/);
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

test("a reassigned field visit follows its new technician and stale mutations lose access", async () => {
  const db = await fullDatabase();
  const [partner, owner, previous, next, firstLine, secondLine, client, visit, pending, customer, dossier, photo] =
    Array.from({ length: 12 }, () => randomUUID());
  try {
    for (const id of [owner, previous, next])
      await db.query("insert into auth.users(id,email) values($1,$2)", [id, id + "@example.invalid"]);
    await db.query("insert into public.partners(id,company_name,email) values($1,'Entreprise fictive','partner@example.invalid')", [partner]);
    await db.query("insert into public.partner_planning_technicians(partner_id,id,name) values($1,$2,'Alice'),($1,$3,'Bob')", [partner, firstLine, secondLine]);
    await db.query(`insert into public.partner_users(partner_id,user_id,role,technician_id)
      values($1,$2,'owner',null),($1,$3,'technician',$4),($1,$5,'technician',$6)`, [partner, owner, previous, firstLine, next, secondLine]);
    await db.query("insert into public.partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Client','Place Rapp','68000','Colmar')", [partner, client]);
    await db.query(`insert into public.partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at,technician_id)
      values($1,$2,$3,'Visite à déplacer',now()+interval '1 day',now()+interval '25 hours',$4),
            ($1,$5,$3,'Visite en attente',null,null,$4)`, [partner, visit, client, firstLine, pending]);
    await db.query(`insert into public.customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)
      values($1,'Client fictif','0600000000','fake@example.invalid','Place Rapp - 68000 - Colmar','Test','2020','exterieur','230V')`, [customer]);
    await db.query(`insert into public.diagnostics(id,customer_id,problem_type,status,assigned_partner_id)
      values($1,$2,'fuite','ASSIGNED',$3)`, [dossier, customer, partner]);
    await db.query(`insert into public.partner_appointments(diagnostic_id,partner_id,starts_at,ends_at,technician_id)
      values($1,$2,now()-interval '3 hours',now()-interval '2 hours',$3)`, [dossier, partner, firstLine]);
    await db.exec("set role service_role");
    const start = (actor: string, source: string, id: string) => db.query<{ session: string }>(
      "select start_partner_field_visit($1,$2,$3,$4) session", [partner, actor, source, id]);
    await assert.rejects(start(next, "private", visit), /FIELD_NOT_FOUND/);
    await assert.rejects(start(previous, "private", pending), /FIELD_NOT_FOUND/);
    await assert.rejects(start(previous, "private", visit), /FIELD_TOO_EARLY/);
    await db.query(`select move_partner_planned_appointment($1,$2,'private',id,updated_at,starts_at,$4)
      from partner_private_visits where id=$3`, [partner, owner, visit, secondLine]);
    await assert.rejects(start(previous, "private", visit), /FIELD_NOT_FOUND/);
    await assert.rejects(start(next, "private", visit), /FIELD_TOO_EARLY/);

    const { session } = (await start(previous, "sanispa", dossier)).rows[0];
    await db.query("update partner_appointments set technician_id=$1 where diagnostic_id=$2", [secondLine, dossier]);
    const addPhoto = (actor: string) => db.query("select store_partner_field_photo($1,$2,$3,$4,'extra')", [partner, actor, session, photo]);
    await assert.rejects(addPhoto(previous), /FIELD_NOT_FOUND/);
    await addPhoto(next);
    assert.equal((await start(next, "sanispa", dossier)).rows[0].session, session);
    await db.query("select set_partner_technician_account($1,$2,$3,null,$4)", [partner, owner, next, secondLine]);
    await assert.rejects(addPhoto(next), /FIELD_NOT_FOUND/);
  } finally { await db.close(); }
});

test("technicians release their own slot once and preserve both private and SANISPA appointment history", async () => {
  const db = await fullDatabase();
  const [partner, owner, technician, colleague, line, otherLine, client, visit, started, customer, dossier, startedDossier] =
    Array.from({ length: 12 }, () => randomUUID());
  try {
    for (const id of [owner, technician, colleague])
      await db.query("insert into auth.users(id,email) values($1,$2)", [id, id + "@example.invalid"]);
    await db.query("insert into partners(id,company_name,email) values($1,'Entreprise fictive','test@example.invalid')", [partner]);
    await db.query("insert into partner_planning_technicians(partner_id,id,name) values($1,$2,'Alice'),($1,$3,'Bob')", [partner, line, otherLine]);
    await db.query(`insert into partner_users(partner_id,user_id,role,technician_id)
      values($1,$2,'owner',null),($1,$3,'technician',$4),($1,$5,'technician',$6)`, [partner, owner, technician, line, colleague, otherLine]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Client fictif','Place Rapp','68000','Colmar')", [partner, client]);
    await db.query(`insert into partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at,technician_id,field_started_at)
      values($1,$2,$3,'Privée',now()+interval '1 day',now()+interval '25 hours',$4,null),
            ($1,$5,$3,'Démarrée',now()-interval '1 hour',now()+interval '1 hour',$4,now())`, [partner, visit, client, line, started]);
    await db.query(`insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)
      values($1,'Client SANISPA fictif','0600000000','test@example.invalid','Place Rapp - 68000 - Colmar','Test','2020','exterieur','230V')`, [customer]);
    await db.query(`insert into diagnostics(id,customer_id,problem_type,status,assigned_partner_id)
      values($1,$2,'fuite','ASSIGNED',$3),($4,$2,'pompe','ASSIGNED',$3)`, [dossier, customer, partner, startedDossier]);
    await db.query(`insert into partner_appointments(diagnostic_id,partner_id,starts_at,ends_at,technician_id)
      values($1,$2,now()-interval '2 days',now()-interval '47 hours',$3),
            ($4,$2,now()-interval '3 hours',now()-interval '2 hours',$3)`, [dossier, partner, line, startedDossier]);
    await db.exec("set role service_role");
    await db.query("select start_partner_field_visit($1,$2,'sanispa',$3)", [partner, technician, startedDossier]);
    const version = async (source: "private" | "sanispa", id: string) => (await db.query<{ version: string }>(source === "private"
      ? "select updated_at::text version from partner_private_visits where id=$1"
      : "select updated_at::text version from partner_appointments where diagnostic_id=$1", [id])).rows[0].version;
    const unplan = (actor: string, source: "private" | "sanispa", id: string, expected: string, reason = "client_absent") => db.query(
      "select unplan_partner_technician_appointment($1,$2,$3,$4,$5,$6,'Note fictive')", [partner, actor, source, id, expected, reason]);
    const privateVersion = await version("private", visit);
    const sanispaVersion = await version("sanispa", dossier);
    await assert.rejects(unplan(colleague, "private", visit, privateVersion), /FIELD_NOT_FOUND/);
    await assert.rejects(unplan(colleague, "sanispa", dossier, sanispaVersion), /FIELD_NOT_FOUND/);
    await assert.rejects(unplan(technician, "private", started, await version("private", started)), /APPOINTMENT_ALREADY_STARTED/);
    await assert.rejects(unplan(technician, "sanispa", startedDossier, await version("sanispa", startedDossier)), /APPOINTMENT_ALREADY_STARTED/);
    await assert.rejects(unplan(technician, "private", visit, "2024-01-01"), /APPOINTMENT_CHANGED/);
    await assert.rejects(unplan(technician, "private", visit, privateVersion, "invalid"), /INVALID_UNPLAN_REASON/);
    await unplan(technician, "private", visit, privateVersion);
    await unplan(technician, "private", visit, privateVersion);
    await unplan(technician, "sanispa", dossier, sanispaVersion, "no_access");
    await unplan(technician, "sanispa", dossier, sanispaVersion, "no_access");
    const privateChange = (await db.query(`select starts_at,client_id,jsonb_array_length(unplanned_appointments) as count,
      unplanned_appointments->0->>'reason' as reason from partner_private_visits where id=$1`, [visit])).rows[0];
    assert.deepEqual(privateChange,{ starts_at: null, client_id: client, count: 1, reason: "client_absent" });
    const sanispaChanges = (await db.query(`select metadata->>'reason' as reason, metadata->>'note' as note
      from diagnostic_activity where diagnostic_id=$1 and event_type='appointment_cancelled'`, [dossier])).rows;
    assert.deepEqual(sanispaChanges,[{ reason: "no_access", note: "Note fictive" }]);
    assert.deepEqual((await db.query(`select assigned_partner_id,status,(select count(*)::int from partner_appointments where diagnostic_id=$1) as slots
      from diagnostics where id=$1`, [dossier])).rows[0],{ assigned_partner_id: partner, status: "ASSIGNED", slots: 0 });
    await db.query(`select book_partner_tour_visit($1,$2,'private',$3,updated_at,now()+interval '3 days',now()+interval '73 hours',$4,true)
      from partner_private_visits where id=$3`, [partner, owner, visit, line]);
    await assert.rejects(unplan(technician, "private", visit, privateVersion), /APPOINTMENT_CHANGED/);
    await db.exec("set role authenticated");
    await assert.rejects(unplan(technician, "sanispa", dossier, sanispaVersion), /permission denied/);
  } finally { await db.close(); }
});
