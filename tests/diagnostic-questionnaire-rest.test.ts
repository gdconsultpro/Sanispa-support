import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { PUT as save, GET as restore } from "../app/api/client/drafts/route";
import { POST as submit } from "../app/api/diagnostics/route";
import { diagnosticPdf } from "../lib/diagnostic-pdf";
import { sanitizeUnlockedPartnerLead } from "../lib/partner-leads";
import { pumpSymptoms } from "../lib/questions";
import { dispatchDatabase, ids } from "./helpers/dispatch-fixture";
import { emptyDraft } from "../lib/storage";
const app = "https://questionnaires.fixture.invalid", base = "https://db.fixture.invalid";
const id = "00000000-0000-4000-8000-000000000099";
const token = `e30.${Buffer.from(JSON.stringify({ sub: ids.user, role: "authenticated", session_id: "00000000-0000-4000-8000-000000000050", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")}.fixture`;
function req(path: string, method = "GET", data?: unknown) { return new Request(app + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined }); }
test("draft APIs, actual SQL submission and dossier/partner/PDF restitution preserve multiple answers and legacy labels", async () => {
  const db = await dispatchDatabase(), originalFetch = globalThis.fetch, env = { ...process.env };
  let row: any;
  try {
    await db.exec(`alter table diagnostic_drafts add column step text default '/questionnaire'; create table client_profiles(user_id uuid primary key,email text,first_name text,last_name text,phone text,address text,postal_code text,city text,spa_brand text,spa_model text,spa_year text);`);
    const sql = await readFile("supabase/migrations/20260908_01_client_access.sql", "utf8");
    await db.exec(sql.match(/create or replace function public.save_diagnostic_draft[\s\S]*?end; \$\$;/)![0]);
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: "fixture-only", NEXT_PUBLIC_APP_URL: app });
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input)); assert.equal(url.origin, base, "No real network/email/payment call permitted");
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.pathname === "/auth/v1/user") return Response.json({ id: ids.user, email: "questionnaire@example.invalid", email_confirmed_at: "2026-09-11" });
      if (url.pathname.endsWith("/rpc/private_session_status")) return Response.json({ active: true });
      if (url.pathname.endsWith("/rpc/consume_request_limit")) return Response.json(true);
      if (url.pathname.endsWith("/rpc/save_diagnostic_draft")) {
        const result = await db.query<{ value: any }>("select save_diagnostic_draft($1,$2,$3,$4,$5) as value", [body.p_id, body.p_user, body.p_version, body.p_step, JSON.stringify(body.p_payload)]);
        return Response.json(result.rows[0].value);
      }
      if (url.pathname.endsWith("/diagnostic_drafts")) return Response.json((await db.query("select * from diagnostic_drafts where id=$1", [id])).rows[0]);
      if (url.pathname.endsWith("/rpc/submit_diagnostic")) {
        assert.ok(body.p_answers.every((a: any) => typeof a.answer === "string"));
        const result = await db.query<{ value: string }>("select submit_diagnostic($1,$2,$3,$4,$5,$6,$7,$8) as value", [body.p_id, body.p_user, body.p_version, body.p_department, body.p_partners, JSON.stringify(body.p_answers), JSON.stringify(body.p_photos), JSON.stringify(body.p_jobs)]);
        return Response.json(result.rows[0].value);
      }
      if (url.pathname.endsWith("/rpc/claim_notifications")) return Response.json([]); // No delivery transport is executed.
      if (url.pathname.endsWith("/diagnostics")) return Response.json(row);
      throw new Error(`Unexpected endpoint: ${url.pathname}`);
    };
    const payload = { ...emptyDraft, name: "TEST Questionnaire", phone: "0000000000", email: "questionnaire@example.invalid", postalCode: "67000", city: "TEST", installationType: "exterieur", problemType: "pompe", choice: "intervention", answers: { pump_symptoms: [pumpSymptoms.noise, pumpSymptoms.stop], pump_stop_delay: "Environ 4 minutes", pump_restart_observed: "Oui", spa_access: "Non, seulement sur certains côtés", actions_tried: "TEST : observation déjà effectuée.\nAucun nouvel essai." + " Observation fictive antérieure. ".repeat(40), pump_details: "Précisions fictives : " + "Observation du bruit sans manipulation. ".repeat(60) } };
    const saved = await save(req("/api/client/drafts", "PUT", { id, version: 0, step: "/resume", payload }));
    assert.equal(saved.status, 200, await saved.clone().text());
    const resumed = await restore(req(`/api/client/drafts?id=${id}`)); assert.equal(resumed.status, 200);
    assert.deepEqual((await resumed.json()).draft.payload.answers.pump_symptoms, payload.answers.pump_symptoms);
    const response = await submit(req("/api/diagnostics", "POST", { draftId: id })); assert.equal(response.status, 200, await response.clone().text());
    row = (await db.query("select * from diagnostics where id=$1", [id])).rows[0];
    row.customers = (await db.query("select * from customers where id=$1", [row.customer_id])).rows[0];
    row.diagnostic_answers = (await db.query("select question_key,question_label,answer from diagnostic_answers where diagnostic_id=$1 order by created_at,id", [id])).rows;
    row.diagnostic_photos = [];
    const symptoms = row.diagnostic_answers.find((a: any) => a.question_key === "pump_symptoms");
    assert.equal(symptoms.answer, `${pumpSymptoms.noise} ; ${pumpSymptoms.stop}`);
    assert.ok(sanitizeUnlockedPartnerLead(row).answers.some(a => a.answer === symptoms.answer));
    const currentPdf = await diagnosticPdf(id);
    assert.ok((await PDFDocument.load(currentPdf)).getPageCount() >= 2);
    // Existing dossiers keep their original labels/values even when question definitions evolve.
    row.problem_type = "traitement-eau";
    row.diagnostic_answers = [{ question_key: "water_color", question_label: "Aspect de l’eau", answer: "Moussante" }, { question_key: "ph_level", question_label: "pH mesuré", answer: "Entre 7 et 7,8" }];
    assert.equal(sanitizeUnlockedPartnerLead(row).answers[1].answer, "Entre 7 et 7,8");
    const legacyPdf = await diagnosticPdf(id); assert.ok((await PDFDocument.load(legacyPdf)).getPageCount() >= 1);
    if (process.env.QUESTIONNAIRE_EVIDENCE_DIR) {
      await mkdir(process.env.QUESTIONNAIRE_EVIDENCE_DIR, { recursive: true });
      await writeFile(`${process.env.QUESTIONNAIRE_EVIDENCE_DIR}/resume-pompe-fictif.pdf`, currentPdf);
      await writeFile(`${process.env.QUESTIONNAIRE_EVIDENCE_DIR}/ancien-dossier-fictif.pdf`, legacyPdf);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env);
    await db.close();
  }
});
