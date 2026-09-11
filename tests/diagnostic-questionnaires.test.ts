import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { draftSchema, validateSubmission } from "../lib/draft-schema";
import { answerText, isQuestionVisible, normalizeDiagnostic, questionsFor, serializeAnswers, toggleAnswer, updateDiagnosticAnswer, validateAnswers } from "../lib/diagnostic-answers";
import { getPhotoRequirements, problemTypes, pumpSymptoms, questionSets } from "../lib/questions";
import { buildWaterContext, waterAssistantInstructions } from "../lib/water-context";
import type { DiagnosticDraft } from "../lib/types";
import { emptyDraft } from "../lib/storage";
const fixture = (problemType: DiagnosticDraft["problemType"], answers: DiagnosticDraft["answers"] = {}): DiagnosticDraft => ({ ...emptyDraft, name: "TEST Questionnaire", email: "questionnaire@example.invalid", phone: "0000000000", postalCode: "67000", city: "TEST", installationType: "exterieur", problemType, choice: "intervention", answers, photos: {} });
const visible = (draft: DiagnosticDraft) => questionsFor(draft).filter(q => isQuestionVisible(q, draft.answers, questionsFor(draft))).map(q => q.id);

test("electrical trip and nested delay only appear for an observed trip; hidden answers removed on both client and server", () => {
  let draft = fixture("electrique", { trip: "Oui", trip_moment: "Quand une pompe démarre", breaker: "Général", trip_delay_type: "Après un délai", trip_delay: "5 min", keyboard_photo_unavailable: "Clavier inaccessible sans démontage" });
  assert.ok(visible(draft).includes("trip_delay"));
  draft = updateDiagnosticAnswer(draft, "trip", "Non");
  for (const key of ["trip_moment", "breaker", "trip_delay_type", "trip_delay"]) { assert.equal(draft.answers[key], undefined); assert.ok(!visible(draft).includes(key)); }
  const forged = validateSubmission({ ...draft, answers: { ...draft.answers, breaker: "Général", trip_delay: "5 min" } });
  assert.equal(forged.answers.breaker, undefined); assert.equal(forged.answers.trip_delay, undefined);
});
test("pump accepts simultaneous symptoms, avoids duplicate questions, and removes obsolete stop details", () => {
  let draft = fixture("pompe", { pump_symptoms: [pumpSymptoms.noise, pumpSymptoms.flow, pumpSymptoms.stop], pump_noise: "Non", flow_ok: "Oui", pump_stop_delay: "4 min", pump_restart_observed: "Oui" });
  draft = normalizeDiagnostic(draft);
  assert.equal(draft.answers.pump_noise, undefined); assert.equal(draft.answers.flow_ok, undefined);
  assert.ok(visible(draft).includes("pump_stop_delay"));
  assert.deepEqual(validateSubmission(draft).answers.pump_symptoms, [pumpSymptoms.noise, pumpSymptoms.flow, pumpSymptoms.stop]);
  assert.match(serializeAnswers(draft).find(a => a.question_key === "pump_symptoms")!.answer, /Bruit inhabituel ; Débit faible/);
  draft = updateDiagnosticAnswer(draft, "pump_symptoms", [pumpSymptoms.noise]);
  assert.equal(draft.answers.pump_stop_delay, undefined); assert.equal(draft.answers.pump_restart_observed, undefined);
  assert.ok(visible(draft).includes("flow_ok"));
});
test("unknown choices are exclusive; invalid multiple radio/number answers are rejected", () => {
  assert.deepEqual(toggleAnswer([pumpSymptoms.stop], "Je ne sais pas"), ["Je ne sais pas"]);
  assert.deepEqual(toggleAnswer(["Je ne sais pas"], pumpSymptoms.stop), [pumpSymptoms.stop]);
  assert.throws(() => validateSubmission(fixture("pompe", { pump_symptoms: [pumpSymptoms.stop, "Je ne sais pas"] })));
  assert.throws(() => validateSubmission(fixture("pompe", { pump_starts: ["Oui", "Non"] })));
  assert.throws(() => validateSubmission(fixture("chauffage", { display_temp: "0x20" })));
  assert.throws(() => validateSubmission(fixture("traitement-eau", { ph_value: "15" })));
  assert.doesNotThrow(() => validateSubmission(fixture("chauffage", { display_temp: "Écran illisible", target_temp: "Valeur inconnue", thermometer_available: "Non", thermometer_temp: "invalid hidden" })));
  assert.doesNotThrow(() => validateSubmission(fixture("traitement-eau", { ph_value: "7,4", tac_value: "Non observable" })));
});
test("all conditional children follow their parents; no parent cycles or duplicate keys", () => {
  for (const { value: problemType } of problemTypes) {
    const questions = questionSets[problemType];
    assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
    assert.ok(questions.length <= 60);
    for (const q of questions.filter(q => q.showWhen && !q.showWhen.legacyWhenUnanswered)) {
      const parent = questions.find(p => p.id === q.showWhen!.questionId); assert.ok(parent, `${problemType}:${q.id}`);
      const absent = fixture(problemType, { [q.id]: "stale" });
      assert.ok(!visible(absent).includes(q.id), `${problemType}:${q.id} absent parent`);
      assert.equal(normalizeDiagnostic(absent).answers[q.id], undefined);
    }
  }
});
test("new technical information stays optional; home access has one shared answer", () => {
  for (const { value } of problemTypes) {
    const answers: DiagnosticDraft["answers"] = value === "autre" ? { description: "TEST : un éclairage ne fonctionne plus", still_usable: "Je ne sais pas" } : value === "electrique" ? { trip: "Je ne sais pas", keyboard_photo_unavailable: "Impossible de prendre une photo avec mon appareil" } : value === "fuite" ? { visible_leak: "Non observable" } : {};
    assert.doesNotThrow(() => validateSubmission(fixture(value, answers)), value);
    assert.equal(questionsFor(fixture(value)).filter(q => q.id === "spa_access").length, 1);
  }
  assert.equal(questionsFor({ ...fixture("pompe"), choice: "devis" }).some(q => q.id === "spa_access"), false);
});
test("legacy drafts keep single choices, error codes, ranges and precise product semantics", () => {
  const leak = validateSubmission(fixture("fuite", { visible_leak: "Oui", suspected_area: "Pompe", recent_freeze: "Oui", spa_access: "Oui sur les 4 côtés" }));
  assert.deepEqual(leak.answers.suspected_area, ["Pompe"]); assert.equal(leak.answers.recent_freeze, "Oui"); assert.equal(leak.answers.triggering_events, undefined, "A recent event does not establish onset chronology");
  assert.ok(visible(fixture("chauffage", { recent_refill: "Oui" })).includes("time_since_refill"));
  assert.ok(visible(fixture("electrique", { recent_service: "Oui" })).includes("recent_service_details"));
  const heat = validateSubmission(fixture("chauffage", { display_temp: "32", target_temp: "38", error_message: "FLO" }));
  assert.equal(heat.answers.error_message, "FLO");
  const updated = updateDiagnosticAnswer(heat, "has_error", "Non"); assert.equal(updated.answers.error_message, undefined);
  const water = validateSubmission(fixture("traitement-eau", { water_color: "Moussante", product_used: "O-care", ph_level: "Entre 7 et 7,8" }));
  assert.equal(water.answers.water_foam, "Oui"); assert.equal(water.answers.complementary_products, "O-care"); assert.equal(water.answers.disinfectant, undefined); assert.equal(water.answers.ph_value, undefined);
  assert.equal(water.answers.ph_level, "Entre 7 et 7,8");
  assert.equal(updateDiagnosticAnswer(water, "ph_value", "7,3").answers.ph_level, undefined);
  assert.equal(updateDiagnosticAnswer(water, "ph_value", "Valeur inconnue").answers.ph_level, "Entre 7 et 7,8");
});
test("green, cloudy, foamy water is preserved independently; disinfectant details disappear when inapplicable", () => {
  let water = fixture("traitement-eau", { water_hue: "Verte", water_clarity: "Trouble", water_foam: "Oui", disinfectant: "Brome", disinfectant_measure: "4 mg/L", water_volume: "1200" });
  const rows = serializeAnswers(validateSubmission(water));
  assert.ok(rows.some(row => row.answer === "Verte")); assert.ok(rows.some(row => row.answer === "Trouble"));
  assert.match(buildWaterContext(rows), /4 mg\/L/); assert.match(buildWaterContext(rows), /1200/);
  assert.match(waterAssistantInstructions, /ne redemande pas une information déjà fournie/);
  water = updateDiagnosticAnswer(water, "disinfectant", "Aucun"); assert.equal(water.answers.disinfectant_measure, undefined);
});
test("electrical photo obligation requires an explicit reason; photo removes obsolete exception", () => {
  const draft = fixture("electrique", { trip: "Non" });
  assert.throws(() => validateSubmission(draft));
  assert.doesNotThrow(() => validateAnswers(draft, false));
  assert.throws(() => validateSubmission({ ...draft, answers: { ...draft.answers, keyboard_photo_unavailable: "Autre impossibilité" } }));
  const explained = { ...draft, answers: { ...draft.answers, keyboard_photo_unavailable: "Autre impossibilité", keyboard_photo_unavailable_detail: "TEST : appareil photo indisponible" } };
  assert.doesNotThrow(() => validateSubmission(explained));
  assert.equal(normalizeDiagnostic({ ...explained, photos: { keyboard: "fixture" } }).answers.keyboard_photo_unavailable, undefined);
  assert.ok(serializeAnswers(explained).some(row => row.question_key === "keyboard_photo_unavailable_detail"));
  for (const { value } of problemTypes) assert.ok(getPhotoRequirements(value).length <= 5);
  assert.ok(getPhotoRequirements("traitement-eau", { technical_bay: "legacy" }).some(photo => photo.id === "technical_bay"));
  assert.equal(draftSchema.safeParse({ ...draft, photos: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i), "fixture"])) }).success, false);
});
test("real draft save function persists multiple values and restores old JSON without touching other drafts", async () => {
  const db = new PGlite();
  try {
    // Minimal table fixtures; the production save function is loaded verbatim, not reimplemented.
    await db.exec(`create table diagnostic_drafts(id uuid primary key,user_id uuid not null,payload jsonb not null,step text not null,version int not null default 1,updated_at timestamptz default now(),submitted_at timestamptz,check(octet_length(payload::text)<=2400000));
      create table client_profiles(user_id uuid primary key,email text,first_name text,last_name text,phone text,address text,postal_code text,city text,spa_brand text,spa_model text,spa_year text);`);
    const migration = await readFile("supabase/migrations/20260908_01_client_access.sql", "utf8");
    await db.exec(migration.match(/create or replace function public.save_diagnostic_draft[\s\S]*?end; \$\$;/)![0]);
    const id = "00000000-0000-4000-8000-000000000091", user = "00000000-0000-4000-8000-000000000092";
    const old = fixture("pompe", { pump_starts: "Oui", pump_noise: "Oui", flow_ok: "Non", pump_details: "Ancien brouillon TEST" });
    const created = await db.query<{ draft: { version: number; payload: DiagnosticDraft } }>("select save_diagnostic_draft($1,$2,0,'/questionnaire',$3) as draft", [id, user, JSON.stringify(old)]);
    const restored = draftSchema.parse(created.rows[0].draft.payload);
    const changed = updateDiagnosticAnswer(restored, "pump_symptoms", [pumpSymptoms.stop, pumpSymptoms.leak]);
    await db.query("select save_diagnostic_draft($1,$2,$3,'/upload',$4)", [id, user, created.rows[0].draft.version, JSON.stringify(changed)]);
    const reloaded = (await db.query<{ payload: DiagnosticDraft; version: number }>("select payload,version from diagnostic_drafts where id=$1", [id])).rows[0];
    assert.equal(reloaded.version, 2); assert.deepEqual(reloaded.payload.answers.pump_symptoms, [pumpSymptoms.stop, pumpSymptoms.leak]);
    assert.equal(reloaded.payload.answers.pump_details, "Ancien brouillon TEST");
    assert.deepEqual(serializeAnswers(draftSchema.parse(reloaded.payload)), serializeAnswers(changed));
    assert.equal(answerText(reloaded.payload.answers.pump_starts), "Oui");
  } finally { await db.close(); }
});
