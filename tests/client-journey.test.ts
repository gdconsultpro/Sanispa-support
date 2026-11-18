import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmedClientDestination,
  clientConfirmationUrl,
} from "../lib/client-access";
import { emptyDraft } from "../lib/storage";
import {
  isQuestionVisible,
  normalizeDiagnostic,
  questionsFor,
  serializeAnswers,
  toggleAnswer,
  updateDiagnosticAnswer,
  validateAnswers,
} from "../lib/diagnostic-answers";
import { pumpSymptoms, questionSets } from "../lib/questions";
import type { DiagnosticDraft } from "../lib/types";
const fixture = (
  problemType: DiagnosticDraft["problemType"],
  answers: DiagnosticDraft["answers"],
): DiagnosticDraft => ({ ...emptyDraft, problemType, answers });
const visible = (draft: DiagnosticDraft) =>
  questionsFor(draft)
    .filter((q) => isQuestionVisible(q, draft.answers, questionsFor(draft)))
    .map((q) => q.id);
test("a silent pump does not ask about running noise or flow; changing symptoms removes stale details", () => {
  const draft = normalizeDiagnostic(
    fixture("pompe", {
      pump_symptoms: [pumpSymptoms.silent],
      pump_noise: "Oui",
      flow_ok: "Oui",
    }),
  );
  assert.ok(!visible(draft).includes("pump_noise"));
  assert.ok(!visible(draft).includes("flow_ok"));
  assert.equal(draft.answers.flow_ok, undefined);
  const running = updateDiagnosticAnswer(draft, "pump_symptoms", [
    pumpSymptoms.stop,
  ]);
  assert.ok(visible(running).includes("pump_stop_delay"));
  assert.ok(visible(running).includes("flow_ok"));
});
test("screen-off removes button, lock and code details, including nested children", () => {
  const draft = normalizeDiagnostic(
    fixture("clavier-ecran", {
      screen_on: "Non",
      buttons_work: "Partiellement",
      affected_controls: "Massage",
      has_error: "Oui",
      error_message: "FLO",
      lock_symbol: "Oui",
    }),
  );
  for (const id of [
    "buttons_work",
    "affected_controls",
    "has_error",
    "error_message",
    "lock_symbol",
  ]) {
    assert.ok(!visible(draft).includes(id), id);
    assert.equal(draft.answers[id], undefined);
  }
  assert.ok(visible(draft).includes("working_functions"));
  assert.equal(
    normalizeDiagnostic(
      fixture("clavier-ecran", { screen_symptoms: ["Écran noir"] }),
    ).answers.screen_on,
    "Non",
  );
});
test("incompatible symptom selections replace each other in UI and are rejected server-side", () => {
  const q = questionSets.chauffage.find((q) => q.id === "heating_symptoms")!;
  assert.deepEqual(
    toggleAnswer(
      ["Ne chauffe plus"],
      "Eau trop chaude ou température dépassant la consigne",
      q.exclusiveGroups,
    ),
    ["Eau trop chaude ou température dépassant la consigne"],
  );
  assert.throws(
    () =>
      validateAnswers(
        fixture("chauffage", {
          heating_symptoms: [
            "Ne chauffe plus",
            "Eau trop chaude ou température dépassant la consigne",
          ],
        }),
      ),
    /contradictoires/,
  );
});
test("unseen leak does not request equipment identification; observed drop keeps its duration", () => {
  const draft = normalizeDiagnostic(
    fixture("fuite", {
      visible_leak: "Non",
      suspected_area: ["Autre"],
      leak_location_detail: "Ancienne réponse",
      level_drop_cm: "3",
      level_drop_duration: "24 h",
    }),
  );
  assert.equal(draft.answers.leak_location_detail, undefined);
  assert.ok(
    serializeAnswers(draft).some(
      (a) => a.question_key === "level_drop_duration" && a.answer === "24 h",
    ),
  );
});
test("confirmation returns to the questionnaire once, or to declaration on a different device; no foreign draft is attached", () => {
  const draft = {
    ...fixture("chauffage", {}),
    email: "client@example.invalid",
  };
  assert.equal(
    confirmedClientDestination(draft, "client@example.invalid"),
    "/questionnaire",
  );
  assert.equal(
    confirmedClientDestination(draft, "other@example.invalid"),
    "/diagnostic",
  );
  assert.equal(
    confirmedClientDestination(emptyDraft, "client@example.invalid"),
    "/diagnostic",
  );
  assert.equal(
    confirmedClientDestination(emptyDraft, "client@example.invalid", false),
    "/espace-client",
  );
  const url = new URL(
    clientConfirmationUrl("https://support.sani-spa.fr", "chauffage"),
  );
  assert.equal(url.pathname, "/auth/retour");
  assert.equal(url.searchParams.get("next"), "diagnostic");
  assert.equal(url.searchParams.get("problemType"), "chauffage");
  assert.equal(
    new URL(
      clientConfirmationUrl(url.origin, "https://evil.invalid"),
    ).searchParams.get("problemType"),
    null,
  );
});
test("leak questionnaire is focused on water loss and a second fault is explicitly opt-in", () => {
  let draft = fixture("fuite", {});
  assert.ok(!visible(draft).includes("has_error"));
  const eventQuestion = questionsFor(draft).find(
    (q) => q.id === "triggering_events",
  )!;
  for (const irrelevant of ["Fuite", "Coupure de courant", "Orage"])
    assert.ok(!eventQuestion.options?.includes(irrelevant));
  assert.ok(!visible(draft).includes("additional_issue_details"));
  draft = updateDiagnosticAnswer(draft, "additional_issue", [
    "Oui, j’ai une autre panne à signaler",
  ]);
  assert.ok(visible(draft).includes("additional_issue_details"));
  draft = updateDiagnosticAnswer(
    draft,
    "additional_issue_details",
    "L’éclairage ne s’allume plus.",
  );
  assert.ok(
    serializeAnswers(draft).some(
      (a) => a.question_key === "additional_issue_details",
    ),
  );
  draft = updateDiagnosticAnswer(draft, "additional_issue", []);
  assert.equal(draft.answers.additional_issue_details, undefined);
});
