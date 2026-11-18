import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as premium } from "../app/api/client/premium/route";
import { GET as listClient, POST as createClient } from "../app/api/client/visio/route";
import { POST as createPartner } from "../app/api/partner/visio/route";
import { GET as listAdmin, POST as manage } from "../app/api/admin/visio/route";
import { clientTokenConfirmationUrl, publicClientIntent } from "../lib/client-access";
import { partnerReturnPath } from "../lib/partner-navigation";
test("visio login destinations remain internal and confirmation tokens stay outside HTTP query strings", () => {
  const url = new URL(clientTokenConfirmationUrl("https://app.fixture.invalid", "a".repeat(64), "visio"));
  assert.equal(url.searchParams.get("next"), "visio"); assert.equal(url.searchParams.get("token_hash"), null); assert.match(url.hash, /token_hash=/);
  assert.equal(publicClientIntent("visio"), "visio"); assert.equal(publicClientIntent("https://evil.invalid"), "diagnostic");
  assert.equal(partnerReturnPath("/partenaire/visio"), "/partenaire/visio"); assert.equal(partnerReturnPath("//evil.invalid"), "/partenaire/leads");
});
const user = "80000000-0000-4000-8000-000000000001", partner = "80000000-0000-4000-8000-000000000002", diagnostic = "80000000-0000-4000-8000-000000000003", video = "80000000-0000-4000-8000-000000000004";
const origin = "https://app.fixture.invalid", db = "https://db.fixture.invalid";
const row = { id: video, requester_id: user, requester_email: "verified@example.invalid", audience: "customer", diagnostic_id: diagnostic, partner_id: null, details: "Une fuite visible près du raccord.", availability: "Mardi après-midi", duration_minutes: 30, quoted_amount: 5900, collected_amount: 0, billing_mode: "complimentary", status: "requested", starts_at: null, meeting_url: null, version: 1, created_at: "2026-11-18" };
async function fixture(run: (state: any, request: (path: string, body?: unknown) => Request) => Promise<void>) {
  const previousFetch = globalThis.fetch, previousEnv = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: db, SUPABASE_SERVICE_ROLE_KEY: "fixture-only", NEXT_PUBLIC_SANISPA_BILLING_MODE: "paused" });
  const state = { confirmed: true, banned: false, active: true, isAdmin: false, mfa: false, partnerActive: true, grants: 0, requests: 0, managed: 0 };
  const request = (path: string, body?: unknown) => {
    const token = `e30.${Buffer.from(JSON.stringify({ sub: user, role: "authenticated", session_id: "80000000-0000-4000-8000-000000000099", exp: Math.floor(Date.now() / 1000) + 3600, aal: state.mfa ? "aal2" : "aal1" })).toString("base64url")}.fixture`;
    return new Request(origin + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, db, "No Stripe, mail or other provider call is permitted");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname === "/auth/v1/user") return Response.json({ id: user, email: row.requester_email, email_confirmed_at: state.confirmed ? "2026-11-18" : null, banned_until: state.banned ? new Date(Date.now()+86400000).toISOString() : null, app_metadata: {} });
    if (url.pathname.endsWith("/rpc/private_session_status")) return Response.json({ active: state.active, is_admin: state.isAdmin, mfa_verified: state.mfa });
    if (url.pathname.endsWith("/customer_subscriptions")) return Response.json(null);
    if (url.pathname.endsWith("/rpc/grant_customer_trial_access")) { assert.equal(body.p_user, user); state.grants++; return Response.json(true); }
    if (url.pathname.endsWith("/rpc/consume_request_limit")) return Response.json(true);
    if (url.pathname.endsWith("/partner_users")) return Response.json(state.partnerActive ? [{ active: true, role: "owner", partners: { id: partner, company_name: "TEST", email: "partner@example.invalid", active: true, leads_paid: true } }] : []);
    if (url.pathname.endsWith("/video_assistance_sessions")) {
      if (!state.isAdmin) { assert.equal(url.searchParams.get("requester_id"), `eq.${user}`); assert.equal(url.searchParams.get("audience"), "eq.customer"); }
      return Response.json([row]);
    }
    if (url.pathname.endsWith("/rpc/request_video_assistance")) {
      assert.equal(body.p_user, user); assert.equal(body.p_email, row.requester_email); assert.equal(body.p_partner, body.p_audience === "partner" ? partner : null);
      assert.equal(body.quoted_amount, undefined); assert.equal(body.collected_amount, undefined); state.requests++;
      return Response.json({ ...row, audience: body.p_audience, partner_id: body.p_partner });
    }
    if (url.pathname.endsWith("/rpc/manage_video_assistance")) { assert.equal(body.p_actor, user); state.managed++; return Response.json({ ...row, status: "scheduled", version: 2, starts_at: body.p_starts_at, meeting_url: body.p_meeting_url }); }
    if (url.pathname.endsWith("/rpc/claim_notifications")) return Response.json([]);
    throw new Error(`Unexpected database request ${url.pathname}`);
  };
  try { await run(state, request); }
  finally { globalThis.fetch = previousFetch; for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key]; Object.assign(process.env, previousEnv); }
}

test("only a confirmed, current session can obtain free Premium or request a visio; client identity, quote and recipient cannot be supplied by JSON", () => fixture(async (state, request) => {
  const payload = { diagnosticId: diagnostic, details: row.details, availability: row.availability };
  state.confirmed = false;
  assert.equal((await premium(request("/api/client/premium"))).status, 401);
  assert.equal((await createClient(request("/api/client/visio", payload))).status, 401);
  assert.equal(state.grants, 0); assert.equal(state.requests, 0);
  state.confirmed = true; state.banned = true;
  assert.equal((await premium(request("/api/client/premium"))).status, 401); assert.equal(state.grants, 0);
  state.banned = false; state.active = false;
  assert.equal((await premium(request("/api/client/premium"))).status, 401);
  state.active = true;
  const access = await premium(request("/api/client/premium")); assert.equal(access.status, 200); assert.deepEqual(await access.json(), { subscription: null, active: true, complimentary: true });
  for (const injected of [{ email: "other@example.invalid" }, { userId: partner }, { quotedAmount: 1 }, { collectedAmount: 5900 }]) assert.equal((await createClient(request("/api/client/visio", { ...payload, ...injected }))).status, 400);
  const created = await createClient(request("/api/client/visio", payload)); assert.equal(created.status, 200); assert.equal(state.requests, 1);
  const session = (await created.json()).session; assert.equal(session.requesterEmail, undefined); assert.equal(session.quotedAmount, 5900); assert.equal(session.collectedAmount, 0);
  assert.equal((await listClient(request("/api/client/visio"))).status, 200);
  const crossSite = request("/api/client/visio", payload); crossSite.headers.set("Origin", "https://evil.invalid"); assert.equal((await createClient(crossSite)).status, 403);
}));

test("partner assistance requires active company membership; administrator scheduling still requires MFA and rejects unsafe links", () => fixture(async (state, request) => {
  const payload = { details: row.details, availability: row.availability };
  state.partnerActive = false; assert.equal((await createPartner(request("/api/partner/visio", payload))).status, 403);
  state.partnerActive = true; assert.equal((await createPartner(request("/api/partner/visio", payload))).status, 200);
  assert.equal((await listAdmin(request("/api/admin/visio"))).status, 403);
  state.isAdmin = true;
  const schedule = { id: video, version: 1, action: "schedule", startsAt: new Date(Date.now() + 86400000).toISOString(), meetingUrl: "https://meet.google.com/abc-defg-hij" };
  assert.equal((await manage(request("/api/admin/visio", schedule))).status, 403); assert.equal(state.managed, 0);
  state.mfa = true;
  assert.equal((await manage(request("/api/admin/visio", { ...schedule, meetingUrl: "https://meet.google.com.evil.invalid/a" }))).status, 400);
  assert.equal((await manage(request("/api/admin/visio", schedule))).status, 200); assert.equal(state.managed, 1);
}));
