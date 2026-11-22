import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePartnerStockCsv } from "../lib/partner-stock-csv";
import { fullDatabase } from "./helpers/full-database";

const owner = "a0a10000-0000-4000-8000-000000000001";
const admin = "a0a10000-0000-4000-8000-000000000002";
const teamMember = "a0a10000-0000-4000-8000-000000000003";
const partner = "a0a10000-0000-4000-8000-000000000004";

test("a stock CSV handles French Excel separators, quoted fields and invalid rows", () => {
  const parsed = parsePartnerStockCsv("\uFEFFCatégorie;Désignation;Référence;Quantité\r\nPièce détachée;\"Filtre; 50 \"\"microns\"\"\";F001;12\r\nSpa;Caldera;S001;-1");
  assert.deepEqual(parsed.articles, [{ category: "piece", label: 'Filtre; 50 "microns"', reference: "F001", quantity: 12 }]);
  assert.equal(parsed.invalid, 1);
  assert.match(parsed.errors[0], /Ligne 3/);
  assert.equal(parsePartnerStockCsv("Type,Nom,Stock\nSpa,Model 1,0").articles[0].reference, "");
  assert.throws(() => parsePartnerStockCsv("Type,Nom,Stock\nSpa,\"Model 1,0"), /guillemets/);
});

test("partner changes, planning a pending job, and CSV imports are scoped to the workspace", async () => {
  const db = await fullDatabase();
  try {
    await db.query("insert into auth.users(id,email) values ($1,'owner@example.invalid'),($2,'admin@example.invalid'),($3,'team@example.invalid')", [owner, admin, teamMember]);
    await db.query("insert into admin_users(user_id,active) values ($1,true)", [admin]);
    await db.query(`insert into partners(id,company_name,contact_name,email,phone,address,postal_code,city,siret,verification_status,verified_at,verified_by)
      values ($1,'Entreprise test','Contact test','team@example.invalid','0600000000','1 rue du Test','67000','Strasbourg','00000000000000','verified',now(),$2)`, [partner, admin]);
    await db.query("insert into partner_users(partner_id,user_id,role) values ($1,$2,'owner'),($1,$3,'technician')", [partner, owner, teamMember]);
    await db.exec("set role service_role");
    const account = (actor: string, values: object) => db.query<{ result: { company: { verification_status: string; email: string }; siretChanged: boolean } }>(
      "select update_partner_account($1,$2,$3) result", [partner, actor, JSON.stringify(values)]);
    await assert.rejects(account(teamMember, { phone: "0600000001" }), /PARTNER_OWNER_REQUIRED/);
    const contact = (await account(owner, { email: "contact@example.invalid", siret: "00000000000000" })).rows[0].result;
    assert.equal(contact.company.verification_status, "verified");
    assert.equal(contact.company.email, "contact@example.invalid");
    assert.equal(contact.siretChanged, false);
    assert.equal((await account(owner, { siret: "11111111111111" })).rows[0].result.siretChanged, true);
    const review = (siret: string | null) => db.query<{ key: string }>("select notify_partner_approval($1,$2,$3) key", [partner, admin, siret]);
    await assert.rejects(review("00000000000000"), /SIRET_CHANGED/);
    await assert.rejects(review(null), /PARTNER_NOT_VERIFIED/);
    const state = (await db.query("select verification_status,verified_at,verified_by from partners where id=$1", [partner])).rows[0];
    assert.deepEqual(state, { verification_status: "pending", verified_at: null, verified_by: null });
    const approvalKey = (await review("11111111111111")).rows[0].key;
    assert.equal((await review("11111111111111")).rows[0].key, approvalKey);
    assert.equal((await review(null)).rows[0].key, approvalKey);
    assert.deepEqual((await db.query("select kind, payload->>'email' email from notification_jobs where key=$1", [approvalKey])).rows,
      [{ kind: "partner_approval", email: "contact@example.invalid" }]);
    const rows = [{ category: "piece", label: "Filtre test", reference: "F1", quantity: 3 },
      { category: "piece", label: "Filtre doublon", reference: "f1", quantity: 5 }];
    const importStock = (actor: string) => db.query<{ count: number }>("select import_partner_stock($1,$2,$3) count", [partner, actor, JSON.stringify(rows)]);
    assert.equal((await importStock(owner)).rows[0].count, 1);
    assert.equal((await importStock(owner)).rows[0].count, 0);
    await assert.rejects(importStock(admin), /PARTNER_REQUIRED/);
    assert.deepEqual((await db.query("select label,quantity from partner_private_stock where partner_id=$1", [partner])).rows, [{ label: "Filtre test", quantity: 3 }]);
    const client = (await db.query<{ id: string }>("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values ($1,gen_random_uuid(),'Client test','10 rue du Test','67000','Strasbourg') returning id", [partner])).rows[0].id;
    const visit = (await db.query<{ id: string; updated_at: Date }>("insert into partner_private_visits(partner_id,id,client_id,title) values($1,gen_random_uuid(),$2,'Révision') returning id,updated_at", [partner, client])).rows[0];
    const book = "select book_partner_tour_visit($1,$2,'private',$3,$4,now()+interval '1 day',now()+interval '25 hours',null,true)";
    await assert.rejects(db.query(book, [partner, admin, visit.id, visit.updated_at]), /ASSIGNED_PARTNER_REQUIRED/);
    await db.query(book, [partner, teamMember, visit.id, visit.updated_at]);
    await assert.rejects(db.query(book, [partner, teamMember, visit.id, visit.updated_at]), /APPOINTMENT_CHANGED/);
    const saved = (await db.query<{ technician_id: string | null; starts_at: Date }>("select starts_at,technician_id from partner_private_visits where id=$1", [visit.id])).rows[0];
    assert.ok(saved.starts_at);
    assert.equal(saved.technician_id, null);
  } finally { await db.close(); }
});

test("admin technician attachment is atomic, scoped and safe to retry", async () => {
  const db = await fullDatabase();
  try {
    const otherCompany = "a0a10000-0000-4000-8000-000000000005";
    await db.query("insert into auth.users(id,email) values ($1,'owner@example.invalid'),($2,'admin@example.invalid'),($3,'team@example.invalid')", [owner, admin, teamMember]);
    await db.query("insert into admin_users(user_id,active) values ($1,true)", [admin]);
    await db.query("insert into partners(id,company_name,email) values ($1,'Entreprise test','one@example.invalid'),($2,'Autre test','two@example.invalid')", [partner, otherCompany]);
    await db.query("insert into partner_users(partner_id,user_id,role) values ($1,$2,'owner')", [partner, owner]);
    const lines = (await db.query<{ id: string }>("insert into partner_planning_technicians(partner_id,id,name) values ($1,gen_random_uuid(),'Ligne A'),($1,gen_random_uuid(),'Ligne B'),($2,gen_random_uuid(),'Ligne privée') returning id", [partner, otherCompany])).rows;
    await db.exec("set role service_role");
    const attach = (user: string, line: string, expected: string | null, actor = admin) => db.query<{ id: string }>(
      "select link_partner_technician_account($1,$2,$3,'Technicien test',false,$4,$5) id", [partner, user, actor, line, expected]);
    await assert.rejects(attach(teamMember, lines[2].id, null), /partner_user_technician_fk/);
    assert.equal((await db.query("select user_id from partner_users where user_id=$1", [teamMember])).rows.length, 0);
    await assert.rejects(attach(teamMember, lines[0].id, null, owner), /ADMIN_REQUIRED/);
    await assert.rejects(attach(owner, lines[0].id, null), /PARTNER_ROLE_CONFLICT/);
    const linked = await attach(teamMember, lines[0].id, null);
    assert.deepEqual(await attach(teamMember, lines[0].id, null).then(result => result.rows), linked.rows);
    await assert.rejects(attach(teamMember, lines[1].id, null), /TECHNICIAN_LINK_CHANGED/);
    await attach(teamMember, lines[1].id, lines[0].id);
    assert.deepEqual((await db.query("select role,technician_id from partner_users where user_id=$1", [teamMember])).rows,
      [{ role: "technician", technician_id: lines[1].id }]);
  } finally { await db.close(); }
});
