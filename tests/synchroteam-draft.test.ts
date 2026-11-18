import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareSynchroteamDraft } from "../lib/synchroteam-draft";
test("Synchroteam preparation has stable references across retries and never sends data, assigns a technician or publishes files", () => {
  const row = { id: "10000000-0000-4000-8000-000000000001", user_id: "10000000-0000-4000-8000-000000000002", customer_id: "10000000-0000-4000-8000-000000000003", problem_type: "fuite", request_type: "TECHNICAL_REQUEST", customers: { name: "TEST CLIENT", email: "test@example.invalid", phone: "0000000000", address: "TEST" }, diagnostic_answers: [{ question_label: "Zone de la fuite", answer: "Raccord" }] };
  const first = prepareSynchroteamDraft(row);
  assert.deepEqual(first, prepareSynchroteamDraft(row));
  assert.equal(first.mode, "preparation_only");
  assert.equal(first.job.body.myId, `sanispa:${row.id}`);
  assert.equal(first.customer.body.myId, first.job.body.customer.myId);
  assert.match(first.job.body.description, /Zone de la fuite : Raccord/);
  assert.equal("technician" in first.job.body, false);
  const next = prepareSynchroteamDraft({ ...row, id: "10000000-0000-4000-8000-000000000004" });
  assert.equal(next.customer.body.myId, first.customer.body.myId);
  assert.notEqual(next.job.body.myId, first.job.body.myId);
});
