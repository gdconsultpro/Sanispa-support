import { test } from "node:test";
import assert from "node:assert/strict";
import { processNotifications } from "../lib/notifications";
test("report notification resolves the current confirmed owner through Auth Admin instead of a queued or partner-provided email", async () => {
  const savedFetch = globalThis.fetch, savedEnv = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://db.fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only", RESEND_API_KEY: "fixture-only", EMAIL_PROVIDER: "resend", NEXT_PUBLIC_APP_URL: "https://app.fixture.invalid" });
  let delivered = 0, state = "pending";
  const owner = "50000000-0000-4000-8000-000000000001";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)), body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.endsWith("/rpc/claim_notifications")) return Response.json(state === "pending" ? [{ id: "job", kind: "client_report", first_delivery_attempt_at: new Date().toISOString(), payload: { reportId: "report", diagnosticId: "diagnostic", email: "wrong@example.invalid", notificationKey: "report:fixture" } }] : []);
    if (url.pathname.endsWith("/intervention_reports")) return Response.json({ client_validated_at: null, diagnostics: { user_id: owner, archived_at: null } });
    if (url.pathname === `/auth/v1/admin/users/${owner}`) return Response.json({ id: owner, email: "confirmed-owner@example.invalid", email_confirmed_at: "2026-11-18", banned_until: null });
    if (url.origin === "https://api.resend.com") { assert.equal(body.to, "confirmed-owner@example.invalid"); delivered++; return Response.json({ id: "delivery" }); }
    if (url.pathname.endsWith("/notification_jobs")) { state = body.state || state; return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected network ${url.origin}${url.pathname}`);
  };
  try { assert.deepEqual(await processNotifications("report:"), { sent: 1, failed: 0 }); assert.equal(delivered, 1); assert.equal(state, "sent"); }
  finally { globalThis.fetch = savedFetch; for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]; Object.assign(process.env, savedEnv); }
});
