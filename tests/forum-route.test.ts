import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/client/forum/route";

test("forum submission accepts the reported payload, keeps moderation, and explains invalid input", async () => {
  const previousFetch = globalThis.fetch;
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SANISPA_BILLING_MODE"];
  const previous = keys.map(key => process.env[key]);
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://forum-fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only", NEXT_PUBLIC_SANISPA_BILLING_MODE: "live" });
  const uid = "30000000-0000-4000-8000-000000000001";
  const token = `e30.${Buffer.from(JSON.stringify({ sub: uid, role: "authenticated", session_id: "30000000-0000-4000-8000-000000000050", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
  const inserted: any[] = [];
  let limits = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://forum-fixture.invalid");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: uid, email: "test@example.invalid", email_confirmed_at: "2026-11-19" });
    if (url.pathname === "/rest/v1/rpc/private_session_status") return Response.json({ active: true, is_admin: false, mfa_verified: false });
    if (url.pathname === "/rest/v1/rpc/customer_has_premium") return Response.json(true);
    if (url.pathname === "/rest/v1/partner_users") return Response.json([]);
    if (url.pathname === "/rest/v1/rpc/consume_request_limit") { limits++; return Response.json(true); }
    if (url.pathname === "/rest/v1/forum_posts" && init?.method === "POST") {
      inserted.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const send = (body: unknown) => POST(new Request("https://example.invalid/api/client/forum", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  try {
    const payload = { title: "Test", body: "Test du forum pour voir si ça fonctionne en public", parentId: null };
    let response = await send(payload);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { submitted: true });
    assert.equal(inserted[0].title, "Test");
    assert.equal(inserted[0].user_id, uid);
    assert.equal(inserted[0].state, "pending");
    response = await send({ ...payload, title: "  " });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Le titre doit contenir au moins 3 caractères." });
    assert.equal(limits, 1);
    assert.equal(inserted.length, 1);
    response = await send({ ...payload, body: "é".repeat(3000) });
    assert.equal(response.status, 200);
    assert.equal(inserted.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});
