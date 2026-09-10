import { test } from "node:test";
import assert from "node:assert/strict";
import { PATCH } from "../app/api/admin/diagnostics/[id]/next-action/route";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://follow-up-test.example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-follow-up-test-only";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.invalid";
const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000050";
const diagnosticId = "00000000-0000-4000-8000-000000000010";
const jwt = (aal: string) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, aal })).toString("base64url")}.simulated`;
const payload = { operation: "save", text: "  Rappeler le client  ", dueAt: "2026-09-12T08:30:00Z", expectedVersion: 0 };
const params = { params: Promise.resolve({ id: diagnosticId }) };
const request = (body: unknown, token: string | null, origin: string | null = "https://app.example.invalid") => new Request(`https://app.example.invalid/api/admin/diagnostics/${diagnosticId}/next-action`, {
  method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});

test("next-action route enforces administrator/MFA/origin and takes actor only from the verified session", async () => {
  const originalFetch = globalThis.fetch;
  let active = true, isAdmin = true, mfa = true;
  const writes: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, "https://follow-up-test.example.invalid");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: userId, email_confirmed_at: "2026-09-01T00:00:00Z" });
    if (url.pathname === "/rest/v1/rpc/private_session_status") return Response.json({ active, is_admin: isAdmin, mfa_verified: mfa });
    if (url.pathname === "/rest/v1/rpc/update_admin_next_action") {
      const body = JSON.parse(String(init?.body)); writes.push(body);
      return Response.json({ text: body.p_text, dueAt: body.p_due_at, state: "pending", version: 1 });
    }
    throw new Error(`Unexpected operation in simulated transport: ${url.pathname}`);
  };
  try {
    assert.equal((await PATCH(request(payload, null), params)).status, 401);
    isAdmin = false; assert.equal((await PATCH(request(payload, jwt("aal2")), params)).status, 403);
    isAdmin = true; assert.equal((await PATCH(request(payload, jwt("aal1")), params)).status, 403);
    mfa = false; assert.equal((await PATCH(request(payload, jwt("aal2")), params)).status, 403);
    mfa = true; active = false; assert.equal((await PATCH(request(payload, jwt("aal2")), params)).status, 401);
    active = true;
    for (const origin of [null, "https://other.example.invalid"]) assert.equal((await PATCH(request(payload, jwt("aal2"), origin), params)).status, 403);
    assert.equal((await PATCH(request({ ...payload, actor: "forged-actor" }, jwt("aal2")), params)).status, 400);
    assert.equal((await PATCH(request({ ...payload, text: " " }, jwt("aal2")), params)).status, 400);
    assert.equal((await PATCH(request(payload, jwt("aal2")), { params: Promise.resolve({ id: "bad-id" }) })).status, 400);
    assert.equal(writes.length, 0);
    const response = await PATCH(request(payload, jwt("aal2")), params);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { action: { text: "Rappeler le client", dueAt: payload.dueAt, state: "pending", version: 1 } });
    assert.deepEqual(writes, [{ p_id: diagnosticId, p_operation: "save", p_text: "Rappeler le client", p_due_at: payload.dueAt, p_expected_version: 0, p_actor: userId }]);
  } finally { globalThis.fetch = originalFetch; }
});

test("next-action route reports conflicts without a success snapshot and supports completing/cancelling", async () => {
  const originalFetch = globalThis.fetch;
  let rpcError: string | null = null;
  let emptyResult = false;
  const operations: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, "https://follow-up-test.example.invalid");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: userId, email_confirmed_at: "2026-09-01T00:00:00Z" });
    if (url.pathname === "/rest/v1/rpc/private_session_status") return Response.json({ active: true, is_admin: true, mfa_verified: true });
    if (url.pathname === "/rest/v1/rpc/update_admin_next_action") {
      if (rpcError) return Response.json({ code: "P0001", message: rpcError }, { status: 400 });
      if (emptyResult) return Response.json(null);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_text, null); assert.equal(body.p_due_at, null); assert.equal(body.p_actor, userId);
      operations.push(body.p_operation);
      return Response.json({ text: "Rappel", dueAt: payload.dueAt, state: body.p_operation === "complete" ? "done" : "cancelled", version: 2 });
    }
    throw new Error(`Unexpected operation in simulated transport: ${url.pathname}`);
  };
  try {
    for (const [message, status] of [["NEXT_ACTION_CONFLICT", 409], ["NEXT_ACTION_STATE", 409], ["NOT_FOUND", 404], ["NEXT_ACTION_INVALID", 400]] as const) {
      rpcError = message;
      const response = await PATCH(request({ operation: "complete", expectedVersion: 1 }, jwt("aal2")), params);
      assert.equal(response.status, status); assert.equal("action" in await response.json(), false);
    }
    rpcError = null; emptyResult = true;
    assert.equal((await PATCH(request({ operation: "complete", expectedVersion: 1 }, jwt("aal2")), params)).status, 503);
    emptyResult = false;
    for (const operation of ["complete", "cancel"]) {
      const response = await PATCH(request({ operation, expectedVersion: 1 }, jwt("aal2")), params);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).action.state, operation === "complete" ? "done" : "cancelled");
    }
    assert.deepEqual(operations, ["complete", "cancel"]);
  } finally { globalThis.fetch = originalFetch; }
});
