import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStripeEvent } from "../lib/stripe-event";
test("a legacy LIVE invoice event is re-read with the pinned SDK schema before paid-period processing", async () => {
  const old = { id: "evt_fixture", type: "invoice.paid", created: 10, data: { object: { id: "in_fixture", lines: { data: [{ id: "sub_fixture" }] } } } };
  const current = { id: "in_fixture", subscription: "sub_fixture", lines: { data: [{ subscription: "sub_fixture", period: { end: 2000000000 } }] } };
  let reads = 0;
  const stripe: any = { invoices: { retrieve: async (id: string) => { assert.equal(id, "in_fixture"); reads++; return current; } } };
  const normalized = await normalizeStripeEvent(old as any, stripe);
  assert.equal(normalized.id, old.id); assert.equal(normalized.created, old.created); assert.equal(normalized.data.object, current); assert.equal(reads, 1);
});
test("other signed event payloads retain their identity without an unnecessary invoice request", async () => {
  const event: any = { id: "evt_fixture", type: "checkout.session.completed", data: { object: { id: "cs_fixture" } } };
  assert.equal(await normalizeStripeEvent(event, {} as any), event);
});
