import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { interventionActionSchema, reviewSchema } from "../lib/interventions";
import { getPhotoRequirements, questionSets } from "../lib/questions";
import { questionsFor } from "../lib/diagnostic-answers";
const client = "10000000-0000-4000-8000-000000000001", actor = "10000000-0000-4000-8000-000000000002", stranger = "10000000-0000-4000-8000-000000000003";
const partner = "10000000-0000-4000-8000-000000000010", other = "10000000-0000-4000-8000-000000000011", diagnostic = "10000000-0000-4000-8000-000000000020", customer = "10000000-0000-4000-8000-000000000030";
const report = "10000000-0000-4000-8000-000000000040", invoice = "10000000-0000-4000-8000-000000000050";
async function fixture() {
  const db = await fullDatabase();
  await db.exec(`insert into auth.users(id,email) values('${client}','client@example.invalid'),('${actor}','partner@example.invalid'),('${stranger}','stranger@example.invalid');
    insert into partners(id,company_name,email) values('${partner}','TEST PARTENAIRE','partner@example.invalid'),('${other}','TEST AUTRE','other@example.invalid');
    insert into partner_users(partner_id,user_id,role) values('${partner}','${actor}','owner'),('${other}','${stranger}','owner');
    insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values('${customer}','TEST','0000000000','client@example.invalid','TEST','TEST','2020','exterieur','230V');
    insert into diagnostics(id,customer_id,user_id,problem_type,choice,status,assigned_partner_id,created_at) values('${diagnostic}','${customer}','${client}','fuite','intervention','ASSIGNED','${partner}',now()-interval '1 day');
    insert into partner_appointments(diagnostic_id,partner_id,starts_at,ends_at) values('${diagnostic}','${partner}',now()-interval '1 hour',now()+interval '1 hour');`);
  return db;
}
const reportArgs = (time: string) => [report, diagnostic, partner, actor, time, "Fuite constatée sur le raccord de la pompe.", "Le raccord a été remplacé et son étanchéité contrôlée.", "Contrôle du niveau d’eau le lendemain.", true];
const reportSql = "select submit_intervention_report($1,$2,$3,$4,$5,$6,$7,$8,$9)";
test("only the assigned active partner schedules, reports on site and deposits an invoice into the server-derived client dossier", async () => {
  const db = await fixture();
  try {
    const time = new Date().toISOString();
    await assert.rejects(db.query("select save_partner_appointment($1,$2,$3,now()+interval '1 day',now()+interval '25 hours')", [diagnostic, other, stranger]), /ASSIGNED/);
    await db.query("select save_partner_appointment($1,$2,$3,now()+interval '1 day',now()+interval '25 hours')", [diagnostic, partner, actor]);
    await assert.rejects(db.query(reportSql, [report, diagnostic, other, stranger, ...reportArgs(time).slice(4)]), /ASSIGNED/);
    await assert.rejects(db.query(reportSql, reportArgs(time)), /APPOINTMENT_REQUIRED/);
    await db.query("select save_partner_appointment($1,$2,$3,now()+interval '1 minute',now()+interval '1 hour')", [diagnostic, partner, actor]);
    const absent = reportArgs(time); absent[8] = false;
    await assert.rejects(db.query(reportSql, absent), /ON_SITE/);
    await db.query(reportSql, reportArgs(time));
    await db.query(reportSql, reportArgs(time));
    assert.equal((await db.query<any>("select count(*)::int n from intervention_reports")).rows[0].n, 1);
    assert.equal((await db.query<any>("select count(*)::int n from notification_jobs where kind='client_report'")).rows[0].n, 1);
    const forged = reportArgs(time); forged[5] = "Une autre réponse changeant le rapport.";
    await assert.rejects(db.query(reportSql, forged), /REPORT_CONFLICT/);
    await assert.rejects(db.query("select register_partner_invoice($1,$2,$3,$4,'Facture.pdf',1024,$5)", [invoice, diagnostic, other, stranger, `${client}/${invoice}.pdf`]), /ASSIGNED/);
    await assert.rejects(db.query("select register_partner_invoice($1,$2,$3,$4,'Facture.pdf',1024,$5)", [invoice, diagnostic, partner, actor, `${stranger}/${invoice}.pdf`]), /INVALID_DOCUMENT/);
    await db.query("select register_partner_invoice($1,$2,$3,$4,'Facture.pdf',1024,$5)", [invoice, diagnostic, partner, actor, `${client}/${invoice}.pdf`]);
    const doc = (await db.query<any>("select user_id,diagnostic_id,issued_by,issuer_partner_id from client_documents")).rows[0];
    assert.deepEqual(doc, { user_id: client, diagnostic_id: diagnostic, issued_by: "partner", issuer_partner_id: partner });
    await db.exec(`update partner_users set active=false where user_id='${actor}'`);
    await assert.rejects(db.query(reportSql, reportArgs(time)), /ASSIGNED/);
  } finally { await db.close(); }
});
test("client validation requires all three ratings, correct ownership and an invoice before repair closure; quote-pending keeps follow-up possible", async () => {
  const db = await fixture();
  try {
    await db.query(reportSql, reportArgs(new Date().toISOString()));
    const validate = "select validate_intervention_report($1,$2,$3,$4,$5,$6)";
    await assert.rejects(db.query(validate, [report, stranger, "repaired", 5, 4, 3]), /CLIENT_REQUIRED/);
    await assert.rejects(db.query(validate, [report, client, "repaired", 5, null, 3]), /COMPLETE_REVIEW/);
    await assert.rejects(db.query(validate, [report, client, "repaired", 5, 4, 3]), /INVOICE_REQUIRED/);
    await assert.rejects(db.query(validate, [report, client, "quote_pending", 6, 4, 3]), /check constraint/);
    await db.query(validate, [report, client, "quote_pending", 5, 4, 3]);
    await db.query(validate, [report, client, "quote_pending", 5, 4, 3]);
    await assert.rejects(db.query(validate, [report, client, "abandoned", 5, 4, 3]), /ALREADY_VALIDATED/);
    assert.equal((await db.query<any>("select status from diagnostics")).rows[0].status, "devis envoyé");
    const args = reportArgs(new Date().toISOString()); args[0] = "10000000-0000-4000-8000-000000000041";
    await db.query(reportSql, args);
    await db.query("select register_partner_invoice($1,$2,$3,$4,'Facture.pdf',1024,$5)", [invoice, diagnostic, partner, actor, `${client}/${invoice}.pdf`]);
    await db.query(validate, [args[0], client, "repaired", 5, 5, 4]);
    assert.equal((await db.query<any>("select status from diagnostics")).rows[0].status, "CLOSED");
    args[0] = "10000000-0000-4000-8000-000000000042";
    await assert.rejects(db.query(reportSql, args), /CASE_CLOSED/);
  } finally { await db.close(); }
});
test("review reminder queues once after three days, stops after validation, and the Synchroteam outbox creates one stable key per declaration", async () => {
  const db = await fixture();
  try {
    await db.query(reportSql, reportArgs(new Date().toISOString()));
    assert.equal((await db.query<any>("select queue_client_review_reminders() n")).rows[0].n, 0);
    await db.exec("update intervention_reports set submitted_at=now()-interval '4 days'");
    assert.equal((await db.query<any>("select queue_client_review_reminders() n")).rows[0].n, 1);
    assert.equal((await db.query<any>("select queue_client_review_reminders() n")).rows[0].n, 0);
    await db.query("select validate_intervention_report($1,$2,'abandoned',4,4,4)", [report, client]);
    assert.equal((await db.query<any>("select count(*)::int n from notification_jobs where state='pending' and kind in ('client_report','client_review_reminder')")).rows[0].n, 0);
    assert.deepEqual((await db.query<any>("select diagnostic_id,external_key,state,attempts from synchroteam_exports")).rows, [{ diagnostic_id: diagnostic, external_key: `sanispa:${diagnostic}`, state: "pending", attempts: 0 }]);
    for (const table of ["intervention_reports", "partner_appointments", "synchroteam_exports"])
      assert.equal((await db.query<any>("select has_table_privilege('authenticated',$1,'SELECT') ok", [table])).rows[0].ok, false);
    assert.equal((await db.query<any>("select has_function_privilege('authenticated','submit_intervention_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,boolean)','EXECUTE') ok")).rows[0].ok, false);
  } finally { await db.close(); }
});
test("new subscriptions store 350 EUR TTC server-side; complete is unavailable and existing technical prices plus moving at 50 EUR are retained", async () => {
  const db = await fixture();
  try {
    await assert.rejects(db.query("select prepare_partner_subscription($1,$2,'complete')", [partner, actor]), /INVALID_PLAN/);
    await assert.rejects(db.query("select prepare_partner_subscription($1,$2,'management')", [partner, actor]), /CHARTER_REQUIRED/);
    await assert.rejects(db.query("select accept_partner_charter($1,$2,'recette-2026-11-18')", [partner, stranger]), /PARTNER_OWNER/);
    await db.query("select accept_partner_charter($1,$2,'recette-2026-11-18')", [partner, actor]);
    const row = (await db.query<any>("select prepare_partner_subscription($1,$2,'management') c", [partner, actor])).rows[0].c;
    assert.equal(row.amount, 35000);
    assert.equal((await db.query<any>("select prepare_partner_subscription($1,$2,'management') c", [partner, actor])).rows[0].c.id, row.id);
    assert.deepEqual((await db.query<any>("select catalog_lead_amount('fuite') fuite,catalog_lead_amount('pompe') pompe,catalog_lead_amount('demenagement') moving")).rows[0], { fuite: 2500, pompe: 5900, moving: 5000 });
  } finally { await db.close(); }
});
test("moving questions only concern transport and access; API rejects missing ratings and partner-forged client fields", () => {
  const questions = questionsFor({ problemType: "demenagement", choice: "intervention", photos: {}, answers: {} });
  assert.ok(questions.length >= 10);
  assert.ok(questions.every(q => q.id.startsWith("moving_")));
  assert.ok(!questionSets.demenagement.some(q => q.id === "has_error"));
  assert.deepEqual(getPhotoRequirements("demenagement").map(p => p.id), ["moving_spa", "moving_departure", "moving_arrival"]);
  assert.equal(reviewSchema.safeParse({ reportId: report, outcome: "repaired", responsiveness: 5, professionalism: 5 }).success, false);
  assert.equal(interventionActionSchema.safeParse({ action: "report", id: report, performedAt: new Date().toISOString(), findings: "Constats complets de la panne.", actions: "Travaux effectués sur place.", nextSteps: "Terminé.", onSite: true, userId: stranger }).success, false);
});
test("actual server role can submit reports and queue reminders without SELECT on private auth.users", async () => {
  const db = await fixture();
  try {
    await db.exec("grant usage on schema public,private to service_role;grant select,insert,update,delete on all tables in schema public to service_role;");
    assert.equal((await db.query<any>("select has_table_privilege('service_role','auth.users','SELECT') b")).rows[0].b, false);
    await db.exec("set role service_role");
    await db.query(reportSql, reportArgs(new Date().toISOString()));
    await db.exec("update intervention_reports set submitted_at=now()-interval '4 days'");
    assert.equal((await db.query<any>("select queue_client_review_reminders() n")).rows[0].n, 1);
    const payload = (await db.query<any>("select payload from notification_jobs where kind='client_report'")).rows[0].payload;
    assert.equal(payload.userId, client); assert.equal(payload.email, undefined);
  } finally { await db.close(); }
});
