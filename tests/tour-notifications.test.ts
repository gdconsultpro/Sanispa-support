import { test } from "node:test";
import assert from "node:assert/strict";
import { processNotifications } from "../lib/notifications";

test("tour mail checks the current appointment and its recipient before submitting the new Paris slot", async context => {
  const savedEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://db.fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture",
    RESEND_API_KEY: "fixture", EMAIL_PROVIDER: "resend", NEXT_PUBLIC_APP_URL: "https://app.fixture.invalid",
  });
  const appointmentId = "50000000-0000-4000-8000-000000000008";
  const partnerId = "50000000-0000-4000-8000-000000000009";
  const owner = "50000000-0000-4000-8000-000000000010";
  const prefix = "tour-slot:fixture:";
  const startsAt = `${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}T13:30:00Z`;
  const endsAt = startsAt.replace("13:30", "14:15");
  const newTime = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", timeStyle: "short" }).format(new Date(startsAt));
  let mode: "private" | "sanispa" = "private";
  let scheduled = true;
  let confirmed = true;
  let state = "pending";
  const delivered: { email: string; html: string; key: string | null }[] = [];
  context.mock.method(globalThis, "fetch", async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.endsWith("/rpc/claim_notifications")) {
      assert.equal(body.p_key, prefix);
      return Response.json(state === "pending" ? [{
        id: "tour-slot-job", key: prefix + mode, kind: "tour_slot_changed", first_delivery_attempt_at: new Date().toISOString(),
        payload: { source: mode, appointmentId, partnerId, startsAt, endsAt, version: startsAt, email: "untrusted@example.invalid" },
      }] : []);
    }
    if (url.pathname.endsWith("/partners")) return Response.json({ company_name: "Technicien <QA>", email: "partner@example.invalid" });
    if (/\/partner_(private_visits|appointments)$/.test(url.pathname)) {
      assert.equal(url.searchParams.get("partner_id"), "eq." + partnerId);
      assert.equal(url.searchParams.get("starts_at"), "eq." + startsAt);
      assert.equal(url.searchParams.get("ends_at"), "eq." + endsAt);
      assert.equal(url.searchParams.get("updated_at"), "eq." + startsAt);
      return Response.json(!scheduled ? [] : [mode === "private" ? { client: { email: "private@example.invalid" } }
        : { diagnostic: { user_id: owner, customer: { email: "old@example.invalid" } } }]);
    }
    if (url.pathname.endsWith("/admin/users/" + owner))
      return Response.json({ id: owner, email: "confirmed@example.invalid", email_confirmed_at: confirmed ? "2026-11-17" : null });
    if (url.origin === "https://api.resend.com") {
      assert.equal(body.reply_to, "partner@example.invalid");
      assert.match(body.subject, /Nouvel horaire/);
      assert.ok(body.html.includes(newTime));
      assert.match(body.html, /Technicien &lt;QA&gt;/);
      delivered.push({ email: body.to, html: body.html, key: new Headers(init?.headers).get("idempotency-key") });
      return Response.json({ id: "mock-delivery" });
    }
    if (url.pathname.endsWith("/notification_jobs")) { state = body.state || state; return new Response(null, { status: 204 }); }
    throw new Error("Unexpected URL " + url.pathname);
  });
  try {
    assert.deepEqual(await processNotifications(prefix), { sent: 1, failed: 0 });
    assert.equal(delivered[0].email, "private@example.invalid");
    assert.equal(delivered[0].key, prefix + "private");
    assert.doesNotMatch(delivered[0].html, /espace-client/);
    assert.equal(state, "sent");
    state = "pending"; scheduled = false;
    assert.deepEqual(await processNotifications(prefix), { sent: 0, failed: 0 });
    assert.equal(state, "cancelled");
    state = "pending"; scheduled = true; mode = "sanispa";
    assert.deepEqual(await processNotifications(prefix), { sent: 1, failed: 0 });
    assert.equal(delivered[1].email, "confirmed@example.invalid");
    assert.ok(delivered[1].html.includes("/espace-client/interventions/" + appointmentId + "#rendez-vous"));
    state = "pending"; confirmed = false;
    assert.deepEqual(await processNotifications(prefix), { sent: 0, failed: 0 });
    assert.equal(delivered.length, 2);
    assert.equal(state, "cancelled");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
});
