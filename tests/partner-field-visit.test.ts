import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { privateWorkStatus, sanispaWorkStatus } from "../lib/partner-workspace";
import { fullDatabase } from "./helpers/full-database";

test("field sessions are scoped, start only after the appointment and freeze the report photos on submission", async () => {
  const db = await fullDatabase();
  const [actor, clientUser, stranger, company, client, visit, pending, customer, dossier, photo, report, sanispaReport] = Array.from({ length: 12 }, () => randomUUID());
  try {
    await db.query("insert into auth.users(id,email) values($1,'worker@example.invalid'),($2,'client@example.invalid'),($3,'other@example.invalid')", [actor, clientUser, stranger]);
    await db.query("insert into partners(id,company_name,email) values($1,'Entreprise de test','company@example.invalid')", [company]);
    await db.query("insert into partner_users(partner_id,user_id,role) values($1,$2,'owner')", [company, actor]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Fiche fictive','Place Rapp','68000','Colmar')", [company, client]);
    await db.query(`insert into partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at) values
      ($1,$2,$3,'Visite fictive',now()-interval '1 hour',now()+interval '1 hour'),
      ($1,$4,$3,'Visite future',now()+interval '2 hours',now()+interval '3 hours')`, [company, visit, client, pending]);
    await db.query("insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values($1,'Client fictif','0600000000','client@example.invalid','Colmar','Test','2020','exterieur','230V')", [customer]);
    await db.query("insert into diagnostics(id,customer_id,user_id,problem_type,status,assigned_partner_id,created_at) values($1,$2,$3,'fuite','ASSIGNED',$4,now()-interval '1 day')", [dossier, customer, clientUser, company]);
    await db.query("insert into partner_appointments(diagnostic_id,partner_id,starts_at,ends_at) values($1,$2,now()-interval '1 hour',now()+interval '1 hour')", [dossier, company]);
    await db.exec("set role service_role");
    const start = (source: string, id: string, user = actor) => db.query<{ id: string }>("select start_partner_field_visit($1,$2,$3,$4) id", [company, user, source, id]);
    await assert.rejects(start("private", visit, stranger), /FIELD_ACCESS_REQUIRED/);
    await assert.rejects(start("private", pending), /FIELD_TOO_EARLY/);
    const session = (await start("private", visit)).rows[0].id;
    assert.equal((await start("private", visit)).rows[0].id, session);
    const state = () => db.query<{ starts_at: string; ends_at: string; field_started_at: string | null; completed_at: string | null; validated_at: string | null; version: string }>(
      "select starts_at::text,ends_at::text,field_started_at::text,completed_at::text,validated_at::text,updated_at::text version from partner_private_visits where id=$1", [visit]);
    assert.equal(privateWorkStatus((await state()).rows[0], Date.now()), "in_progress");
    await assert.rejects(db.query("update partner_private_visits set starts_at=null,ends_at=null where id=$1", [visit]), /PARTNER_VISIT_FINISHED/);
    const photoChange = (id: string, remove: boolean) => db.query("select change_partner_field_photo($1,$2,$3,$4,$5)", [company, actor, id, photo, remove]);
    await photoChange(session, false);
    await photoChange(session, false);
    const time = (await db.query<{ time: string }>("select now()::text time")).rows[0].time;
    const submit = (key: string, id: string) => db.query(
      "select submit_partner_field_report($1,$2,$3,$4,$5,$6,$7,$8)",
      [company, actor, key, id, time, "Constat détaillé pour essai", "Travaux et mesures contrôlés", "Refaire la mesure"]);
    await submit(session, report);
    await submit(session, report);
    await assert.rejects(photoChange(session, true), /FIELD_ALREADY_FINISHED/);
    const completed = (await state()).rows[0];
    assert.equal(privateWorkStatus(completed, Date.now()), "review");
    await db.query("select advance_partner_private_visit($1,$2,$3,$4,true)", [company, actor, visit, completed.version]);
    assert.equal(privateWorkStatus((await state()).rows[0], Date.now()), "validated");
    const assignedSession = (await start("sanispa", dossier)).rows[0].id;
    const assignedAppt = { diagnostic_id: dossier, starts_at: "2026-11-22T10:00:00Z", ends_at: "2026-11-22T11:00:00Z", technician_id: null, updated_at: time };
    const assignedDossier = { status: "ASSIGNED", problem_type: "fuite", customer: null,
      partner_field_sessions: [{ appointment_start: assignedAppt.starts_at, submitted_at: null }] };
    assert.equal(sanispaWorkStatus(assignedDossier, { ...assignedAppt, diagnostic: assignedDossier }, Date.now()).workStatus, "in_progress");
    await photoChange(assignedSession, false);
    await submit(assignedSession, sanispaReport);
    const persisted = (await db.query<{ report_id: string; notification_count: number }>(
      "select report_id,(select count(*)::int from notification_jobs where key='report:' || $2::text) notification_count from partner_field_sessions where id=$1",
      [assignedSession, sanispaReport])).rows[0];
    assert.equal(persisted.report_id, sanispaReport);
    assert.equal(persisted.notification_count, 1);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from intervention_reports where diagnostic_id=$1 and client_validated_at is null", [dossier])).rows[0].n, 1);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from partner_field_photos where session_id=$1", [session])).rows[0].n, 1);
  } finally { await db.close(); }
});
