import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoState, demoLead, demoReducer, demoStatus, demoView } from "../lib/demo";
import { demoDocumentLines } from "../lib/demo-pdf";
test("demo views cannot navigate into a real account or turn arbitrary query values into a role", () => {
  assert.deepEqual(demoView("../../admin", "https://evil.invalid"), { role: "client", tab: "accueil" });
  assert.deepEqual(demoView("partenaire", "rapport"), { role: "partenaire", tab: "rapport" });
  assert.equal(demoLead("demenagement").amount, 5000); assert.equal(demoLead("fuite").amount, 2500);
});
test("independent visitors and resets never share modified demo data", () => {
  const one = createDemoState("partenaire"), two = createDemoState("partenaire");
  const changed = demoReducer(one, { type: "acquire" }); assert.equal(changed.contactPaid, true); assert.equal(two.contactPaid, false); assert.equal(one.contactPaid, false);
  changed.photos.push("Un exemple local"); assert.equal(two.photos.length, 3);
  const reset = demoReducer(changed, { type: "reset", role: "client" }); assert.equal(reset.contactPaid, false); assert.equal(reset.dispatch, "pending"); assert.equal(reset.photos.length, 3);
});
test("the demo illustrates approval, subscription and invoice requirements before revealing contacts or closing a repair", () => {
  let state = createDemoState();
  assert.equal(demoReducer(state, { type: "acquire" }), state);
  state = demoReducer(state, { type: "dispatch", decision: "released" });
  const inactive = demoReducer(state, { type: "subscription", active: false }); assert.equal(demoReducer(inactive, { type: "acquire" }), inactive);
  state = demoReducer(state, { type: "acquire" }); assert.equal(state.contactPaid, true);
  assert.equal(demoReducer(state, { type: "dispatch", decision: "kept" }), state);
  const report = { findings: "Constat fictif", actions: "Action fictive", next: "Suivi fictif" };
  assert.equal(demoReducer(state, { type: "report", report }), state);
  state = demoReducer(state, { type: "schedule", date: "2026-11-23T10:00" }); state = demoReducer(state, { type: "report", report });
  const validation = { type: "validate" as const, outcome: "repaired" as const, ratings: { responsiveness: 5, professionalism: 4, pricing: 5 } };
  assert.equal(demoReducer(state, validation), state);
  state = demoReducer(state, { type: "invoice" }); state = demoReducer(state, validation); assert.equal(demoStatus(state), "Dossier clôturé");
});
test("water advice is not sold as a technical lead and free demo documents remain available without Premium", () => {
  let state = demoReducer(createDemoState(), { type: "problem", problem: "traitement-eau" });
  assert.equal(demoReducer(state, { type: "dispatch", decision: "released" }), state); assert.equal(demoStatus(state), "Conseil Premium");
  state = demoReducer(state, { type: "premium", active: false });
  assert.equal(demoReducer(state, { type: "ask", topic: "eau", text: "Bonjour", includeReading: true }), state);
  assert.equal(demoReducer(state, { type: "post", title: "Test", body: "Test" }), state);
  assert.ok(demoDocumentLines("invoice", state).some(line => line.includes("180,00 EUR")));
});
test("unknown readings stay unknown in the simulated assistant, and reminders create a single journal entry", () => {
  let state = createDemoState(); state = demoReducer(state, { type: "reading", reading: { id: "demo-unknown", date: "Aujourd’hui", ph: null, tac: null, disinfectant: null, temperature: null } });
  state = demoReducer(state, { type: "ask", topic: "eau", text: "Mon eau est trouble", includeReading: true });
  assert.match(state.messages.at(-1)!.text, /pH inconnu/); assert.ok(!state.messages.at(-1)!.text.includes("pH 0"));
  state = demoReducer(state, { type: "completeReminder", id: "demo-reminder-1" }); const count = state.journal.length;
  state = demoReducer(state, { type: "completeReminder", id: "demo-reminder-1" }); assert.equal(state.journal.length, count);
});
test("demo forum posts wait for moderation before publication and can be refused", () => {
  let state = demoReducer(createDemoState(), { type: "post", title: "Mon retour", body: "Un message fictif" });
  assert.equal(state.posts[0].state, "pending"); const id = state.posts[0].id;
  state = demoReducer(state, { type: "moderate", id, decision: "approved" }); assert.equal(state.posts[0].state, "approved");
  state = demoReducer(state, { type: "moderate", id, decision: "rejected" }); assert.equal(state.posts[0].state, "rejected");
});
