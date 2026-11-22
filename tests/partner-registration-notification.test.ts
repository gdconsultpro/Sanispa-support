import assert from "node:assert/strict";
import { test } from "node:test";
import { processNotifications } from "../lib/notifications";

test("a partner registration alerts only the configured administrator and retries with the same key", async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://db.fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture", RESEND_API_KEY: "fixture", EMAIL_PROVIDER: "resend",
    NEXT_PUBLIC_APP_URL: "https://app.fixture.invalid", ADMIN_NOTIFICATION_EMAIL: "admin@example.invalid",
  });
  const partnerId = "93100000-0000-4000-8000-000000000001";
  const key = "partner-registration:" + partnerId;
  let state = "pending";
  let partnerExists = true;
  let failToMarkSent = true;
  const deliveries = new Set<string>();
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.href === "https://api.resend.com/emails") {
      requests++;
      assert.equal(body.to, "admin@example.invalid");
      assert.equal(body.subject, "SANISPA Support — Nouvelle inscription partenaire");
      assert.match(body.html, /Fictif &amp; Spa/);
      assert.match(body.html, /https:\/\/app\.fixture\.invalid\/admin\?tab=partners/);
      const providerKey = new Headers(init?.headers).get("Idempotency-Key");
      assert.equal(providerKey, key);
      deliveries.add(providerKey);
      return Response.json({ id: "fixture-delivery" });
    }
    assert.equal(url.origin, "https://db.fixture.invalid");
    if (url.pathname.endsWith("/rpc/claim_notifications")) {
      assert.equal(body.p_key, key);
      return Response.json(state === "pending" ? [{
        id: "job-fixture", key, kind: "partner_registration", first_delivery_attempt_at: new Date().toISOString(),
        payload: { partnerId, companyName: "Fictif & Spa" },
      }] : []);
    }
    if (url.pathname.endsWith("/partners")) return Response.json(partnerExists ? { id: partnerId } : null);
    assert.equal(url.pathname, "/rest/v1/notification_jobs");
    if (body.state === "sent" && failToMarkSent) {
      failToMarkSent = false;
      return Response.json({ message: "Acknowledgement write failed" }, { status: 500 });
    }
    if (body.state) state = body.state;
    return new Response(null, { status: 204 });
  };
  try {
    await processNotifications(key);
    assert.equal(state, "pending");
    await processNotifications(key);
    assert.equal(state, "sent");
    await processNotifications(key);
    assert.equal(requests, 2);
    assert.equal(deliveries.size, 1);
    state = "pending";
    partnerExists = false;
    await processNotifications(key);
    assert.equal(state, "cancelled");
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
});
