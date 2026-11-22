import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { privateWorkStatus, sanispaWorkStatus } from "../lib/partner-workspace";
import { fullDatabase } from "./helpers/full-database";

test("technicians close private field reports, keep photos and can prepare a single follow-up for either kind of intervention", async () => {
  const db = await fullDatabase();
  const [actor, clientUser, stranger, company, client, visit, pending, customer, dossier, photo, report, sanispaReport] = Array.from({ length: 12 }, () => randomUUID());
  try {
    await db.query("insert into auth.users(id,email) values($1,'worker@example.invalid'),($2,'client@example.invalid'),($3,'other@example.invalid')", [actor, clientUser, stranger]);
    await db.query("insert into partners(id,company_name,email) values($1,'Entreprise de test','company@example.invalid')", [company]);
    await db.query("insert into partner_users(partner_id,user_id,role) values($1,$2,'technician')", [company, actor]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Fiche fictive','Place Rapp','68000','Colmar')", [company, client]);
    await db.query(`insert into partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at) values
      ($1,$2,$3,'Visite fictive',now()-interval '1 hour',now()+interval '1 hour'),
      ($1,$4,$3,'Visite future',now()+interval '2 hours',now()+interval '3 hours')`, [company, visit, client, pending]);
    await db.query("insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values($1,'Client fictif','0600000000','client@example.invalid','Place Rapp - 68000 - Colmar','Test','2020','exterieur','230V')", [customer]);
    await db.query("insert into diagnostics(id,customer_id,user_id,problem_type,status,assigned_partner_id,created_at) values($1,$2,$3,'fuite','ASSIGNED',$4,now()-interval '1 day')", [dossier, customer, clientUser, company]);
    const offer = (await db.query<{ offered_at: string }>(`update diagnostics set partner_released_at=now(),matched_partner_ids=array[$2::uuid]
      where id=$1 returning partner_released_at::text offered_at`, [dossier, company])).rows[0].offered_at;
    await db.query("insert into partner_appointments(diagnostic_id,partner_id,starts_at,ends_at) values($1,$2,now()-interval '1 hour',now()+interval '1 hour')", [dossier, company]);
    await db.exec("set role service_role");
    const acknowledge = (user = actor, offeredAt = offer) => db.query("select acknowledge_partner_offer($1,$2,$3,$4)", [company, user, dossier, offeredAt]);
    await assert.rejects(acknowledge(stranger), /FIELD_ACCESS_REQUIRED/);
    await assert.rejects(acknowledge(actor, "2020-01-01"), /LEAD_UNAVAILABLE/);
    assert.deepEqual((await acknowledge()).rows, (await acknowledge()).rows);
    const counts = () => db.query("select sent::int, completed::int from partner_dispatch_totals()");
    assert.deepEqual((await counts()).rows, [{ sent: 1, completed: 0 }]);
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
    const followup = (source: string, origin: string, reportId: string, user = actor) => db.query<{ id: string }>(
      "select create_partner_field_followup($1,$2,$3,$4,$5,'Suivi test') id", [company, user, source, origin, reportId]);
    await assert.rejects(followup("private", visit, report), /FIELD_REPORT_NOT_FOUND/);
    await submit(session, report);
    await submit(session, report);
    await assert.rejects(photoChange(session, true), /FIELD_ALREADY_FINISHED/);
    assert.equal(privateWorkStatus((await state()).rows[0], Date.now()), "validated");
    await assert.rejects(followup("private", visit, report, stranger), /FIELD_ACCESS_REQUIRED/);
    const copied = (await followup("private", visit, report)).rows[0].id;
    assert.equal((await followup("private", visit, report)).rows[0].id, copied);
    assert.deepEqual((await db.query(`select client_id, starts_at, completed_at, description,
      previous_report->>'findings' as findings, previous_report->>'actions' as actions
      from partner_private_visits where id=$1`, [copied])).rows[0], {
      client_id: client, starts_at: null, completed_at: null, description: "Refaire la mesure",
      findings: "Constat détaillé pour essai", actions: "Travaux et mesures contrôlés",
    });
    const assignedSession = (await start("sanispa", dossier)).rows[0].id;
    const assignedAppt = { diagnostic_id: dossier, starts_at: "2026-11-22T10:00:00Z", ends_at: "2026-11-22T11:00:00Z", technician_id: null, updated_at: time };
    const assignedDossier = { status: "ASSIGNED", problem_type: "fuite", customer: null,
      partner_field_sessions: [{ appointment_start: assignedAppt.starts_at, submitted_at: null }] };
    assert.equal(sanispaWorkStatus(assignedDossier, { ...assignedAppt, diagnostic: assignedDossier }, Date.now()).workStatus, "in_progress");
    await photoChange(assignedSession, false);
    await submit(assignedSession, sanispaReport);
    await submit(assignedSession, sanispaReport);
    assert.deepEqual((await counts()).rows, [{ sent: 1, completed: 1 }]);
    const tracked = (await db.query<{ event_type: string }>(`select event_type from diagnostic_activity
      where diagnostic_id=$1 and event_type in ('partner_offer_received', 'partner_intervention_confirmed') order by created_at`, [dossier])).rows;
    assert.deepEqual(tracked.map(event => event.event_type), ["partner_offer_received", "partner_intervention_confirmed"]);
    const assignedCopy = (await followup("sanispa", dossier, sanispaReport)).rows[0].id;
    assert.equal((await followup("sanispa", dossier, sanispaReport)).rows[0].id, assignedCopy);
    assert.deepEqual((await db.query(`select v.starts_at, c.source_diagnostic_id, v.previous_report->>'source' as source
      from partner_private_visits v join partner_private_clients c on c.partner_id=v.partner_id and c.id=v.client_id
      where v.id=$1`, [assignedCopy])).rows[0], { starts_at: null, source_diagnostic_id: dossier, source: "sanispa" });
    const persisted = (await db.query<{ report_id: string; notification_count: number }>(
      "select report_id,(select count(*)::int from notification_jobs where key='report:' || $2::text) notification_count from partner_field_sessions where id=$1",
      [assignedSession, sanispaReport])).rows[0];
    assert.equal(persisted.report_id, sanispaReport);
    assert.equal(persisted.notification_count, 1);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from intervention_reports where diagnostic_id=$1 and client_validated_at is null", [dossier])).rows[0].n, 1);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from partner_field_photos where session_id=$1", [session])).rows[0].n, 1);
  } finally { await db.close(); }
});

test("structured SAV and installation reports require their evidence and keep extra photos optional", async () => {
  const db = await fullDatabase();
  const [actor, partner, client, sav, installation] = Array.from({ length: 5 }, () => randomUUID());
  try {
    await db.query("insert into auth.users(id,email) values($1,'specialist@example.invalid')", [actor]);
    await db.query("insert into partners(id,company_name,email) values($1,'Entreprise fictive','specialist@example.invalid')", [partner]);
    await db.query("insert into partner_users(partner_id,user_id,role) values($1,$2,'technician')", [partner, actor]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Client fictif','Place Rapp','68000','Colmar')", [partner, client]);
    await db.query(`insert into partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at) values
      ($1,$2,$3,'Intervention SAV',now()-interval '1 hour',now()+interval '1 hour'),
      ($1,$4,$3,'Mise en service',now()-interval '1 hour',now()+interval '1 hour')`, [partner, sav, client, installation]);
    await db.exec("set role service_role");
    async function start(visit: string) {
      return (await db.query<{ id: string }>("select start_partner_field_visit($1,$2,'private',$3) id", [partner, actor, visit])).rows[0].id;
    }
    const photo = (session: string, kind: string) => db.query("select store_partner_field_photo($1,$2,$3,$4,$5)", [partner, actor, session, randomUUID(), kind]);
    const submit = (session: string, report: string, details: object) => db.query(
      "select submit_structured_partner_field_report($1,$2,$3,$4,now(),'Constat détaillé pour essai','Travaux et mesures contrôlés','Aucune suite à prévoir.',$5)",
      [partner, actor, session, report, JSON.stringify(details)]);

    const savSession = await start(sav);
    const savReport = randomUUID();
    const savDetails = { template: "sav", answers: { spa: "Spa fictif B", finished: "Non" } };
    await photo(savSession, "receipt");
    await assert.rejects(photo(savSession, "receipt"), /FIELD_RECEIPT_EXISTS/);
    await photo(savSession, "extra");
    await assert.rejects(submit(savSession, savReport, savDetails), /FIELD_REQUIRED_PHOTOS/);
    await photo(savSession, "finish");
    await submit(savSession, savReport, savDetails);
    const [saved] = (await db.query("select report_details from partner_field_sessions where id=$1", [savSession])).rows;
    assert.deepEqual(saved, { report_details: savDetails });
    await assert.rejects(photo(savSession, "extra"), /FIELD_ALREADY_FINISHED/);

    const installationSession = await start(installation);
    const installationReport = randomUUID();
    const installationDetails = { template: "installation", answers: { checked: "Oui" } };
    for (const kind of ["serial", "water", "electrical", "finish"]) await photo(installationSession, kind);
    await assert.rejects(submit(installationSession, installationReport, installationDetails), /FIELD_REQUIRED_PHOTOS/);
    await photo(installationSession, "heating");
    await submit(installationSession, installationReport, installationDetails);
    const next = (await db.query<{ id: string }>("select create_partner_field_followup($1,$2,'private',$3,$4,'Suite') id",
      [partner, actor, installation, installationReport])).rows[0].id;
    assert.deepEqual((await db.query("select previous_report->'details' details from partner_private_visits where id=$1", [next])).rows,
      [{ details: installationDetails }]);
  } finally { await db.close(); }
});
