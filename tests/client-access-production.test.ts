import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/client/access/route";
import { clientTokenConfirmationUrl } from "../lib/client-access";
const app = "https://support.sani-spa.fr", db = "https://db.fixture.invalid", token = "a".repeat(64);
const request = (body: unknown, origin = app) => new Request(app + "/api/client/access", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" }, body: JSON.stringify(body) });
async function fixture(run: (state: any) => Promise<void>) {
  const previousFetch = globalThis.fetch, env = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_APP_URL: app, NEXT_PUBLIC_SUPABASE_URL: db, SUPABASE_SERVICE_ROLE_KEY: "fixture", RESEND_API_KEY: "fixture", EMAIL_PROVIDER: "resend", EMAIL_FROM: "SANISPA <test@example.invalid>" });
  const state = { calls: [] as any[], limited: false, banned: false, missing: false, sent: null as any, adminActive: true, adminEmail: "admin@example.invalid" };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)), body = JSON.parse(String(init?.body || "{}")); state.calls.push({ path: url.pathname, body });
    if (url.origin === db && url.pathname.endsWith("/rpc/consume_request_limit")) return Response.json(!state.limited);
    if (url.origin === db && url.pathname === "/rest/v1/admin_users") { assert.equal(url.searchParams.get("active"), "eq.true"); return Response.json(state.adminActive ? [{ user_id: "40000000-0000-4000-8000-000000000001" }] : []); }
    if (url.origin === db && url.pathname === "/auth/v1/admin/users/40000000-0000-4000-8000-000000000001") return Response.json({ id: "40000000-0000-4000-8000-000000000001", email: state.adminEmail, email_confirmed_at: "2026-01-01", banned_until: state.banned ? "2099-01-01" : undefined });
    if (url.origin === db && url.pathname === "/auth/v1/admin/generate_link") {
      if (state.missing) return Response.json({ msg: "User not found", code: "user_not_found" }, { status: 404 });
      return Response.json({ id: "40000000-0000-4000-8000-000000000001", email: body.email, banned_until: state.banned ? "2099-01-01" : undefined,
        action_link: "https://obsolete.fixture.invalid", redirect_to: "https://obsolete.fixture.invalid", hashed_token: token, email_otp: "123456", verification_type: body.type });
    }
    if (url.origin === "https://api.resend.com" && url.pathname === "/emails") { state.sent = body; return Response.json({ id: "fixture-delivery" }); }
    throw new Error(`Unexpected request ${url.origin}${url.pathname}`);
  };
  try { await run(state); }
  finally { globalThis.fetch = previousFetch; for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k]; Object.assign(process.env, env); }
}
test("new confirmation links use the configured origin and keep one-use tokens outside HTTP queries", () => {
  const link = new URL(clientTokenConfirmationUrl(app, token, "premium", "fuite"));
  assert.equal(link.origin, app); assert.equal(link.pathname, "/auth/retour"); assert.equal(link.searchParams.get("next"), "premium");
  assert.equal(link.searchParams.get("problemType"), "fuite"); assert.ok(!link.search.includes(token));
  assert.equal(new URLSearchParams(link.hash.slice(1)).get("token_hash"), token);
  assert.throws(() => clientTokenConfirmationUrl("javascript:alert(1)", token, "premium"));
  const recovery = new URL(clientTokenConfirmationUrl(app, token, "recovery"));
  assert.equal(recovery.searchParams.get("next"), "recovery"); assert.equal(new URLSearchParams(recovery.hash.slice(1)).get("type"), "recovery");
});
test("a forged origin or arbitrary redirect is rejected before any privileged call", () => fixture(async s => {
  assert.equal((await POST(request({ email: "test@example.invalid", next: "premium" }, "https://evil.fixture.invalid"))).status, 403);
  assert.equal((await POST(request({ email: "test@example.invalid", next: "https://evil.fixture.invalid" }))).status, 400);
  assert.equal((await POST(request({ email: "test@example.invalid", next: "premium", redirectTo: "https://evil.fixture.invalid" }))).status, 400);
  assert.equal(s.calls.length, 0);
}));
test("rate limiting prevents generating a token or delivering an e-mail", () => fixture(async s => {
  s.limited = true; assert.equal((await POST(request({ email: "test@example.invalid", next: "premium" }))).status, 429);
  assert.equal(s.calls.length, 1); assert.equal(s.sent, null);
}));
test("the server sends the public-domain confirmation without exposing credentials in the response", () => fixture(async s => {
  const r = await POST(request({ email: " Test@Example.invalid ", next: "premium", problemType: "fuite" }));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true }); assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(s.sent.to, "test@example.invalid"); assert.ok(s.sent.html.includes(app + "/auth/retour?next=premium"));
  assert.ok(s.sent.html.includes("#token_hash=" + token)); assert.ok(!s.sent.html.includes("obsolete.fixture.invalid"));
  assert.equal(s.calls.filter((c: any) => c.path.endsWith("consume_request_limit")).length, 4);
  assert.ok(s.calls.filter((c: any) => c.path.endsWith("consume_request_limit")).every((c: any) => !c.body.p_key.includes("test@example.invalid")));
}));
test("blocked accounts receive no link and no account-existence disclosure", () => fixture(async s => {
  s.banned = true; const r = await POST(request({ email: "test@example.invalid", next: "diagnostic" }));
  assert.deepEqual(await r.json(), { ok: true }); assert.equal(s.sent, null);
}));
test("recovery uses its own verification intent and hides missing accounts", () => fixture(async s => {
  const r = await POST(request({ email: "test@example.invalid", next: "recovery" })); assert.equal(r.status, 200);
  assert.equal(s.calls.find((c: any) => c.path.endsWith("generate_link")).body.type, "recovery");
  assert.ok(s.sent.html.includes("next=recovery")); assert.ok(s.sent.html.includes("type=recovery"));
  s.missing = true; s.sent = null; const missing = await POST(request({ email: "missing@example.invalid", next: "recovery" }));
  assert.deepEqual(await missing.json(), { ok: true }); assert.equal(s.sent, null);
}));
test("administrator links only go to an active confirmed administrator, preserve the admin destination, and return no token", () => fixture(async s => {
  const r = await POST(request({ email: "admin@example.invalid", next: "admin" }));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(s.sent.to, "admin@example.invalid"); assert.ok(s.sent.html.includes("/auth/retour?next=admin"));
  const link = new URL(clientTokenConfirmationUrl(app, token, "admin"));
  assert.equal(link.searchParams.get("next"), "admin");
  assert.equal(new URLSearchParams(link.hash.slice(1)).get("type"), "email");
}));
test("administrator requests by ordinary, inactive or banned accounts neither generate a credential nor reveal membership", () => fixture(async s => {
  for (const scenario of ["ordinary", "inactive", "banned"]) {
    s.adminActive = scenario !== "inactive"; s.banned = scenario === "banned"; s.calls = []; s.sent = null;
    const response = await POST(request({ email: scenario === "ordinary" ? "client@example.invalid" : "admin@example.invalid", next: "admin" }));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
    assert.equal(s.sent, null); assert.ok(!s.calls.some((c: any) => c.path.endsWith("generate_link")));
  }
}));
