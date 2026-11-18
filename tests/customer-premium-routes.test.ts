import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as care, POST as saveCare } from "../app/api/client/care/route";
import { GET as forum } from "../app/api/client/forum/route";
import { GET as manuals } from "../app/api/client/manuals/route";
import { GET as assistant, POST as ask } from "../app/api/client/assistant/route";
import { GET as documents } from "../app/api/client/documents/route";
import { POST as moderate } from "../app/api/admin/forum/route";
const uid = "40000000-0000-4000-8000-000000000001", thread = "40000000-0000-4000-8000-000000000010", requestId = "40000000-0000-4000-8000-000000000020";
const origin = "https://app.fixture.invalid", db = "https://db.fixture.invalid";
const token = `e30.${Buffer.from(JSON.stringify({ sub: uid, role: "authenticated", session_id: "40000000-0000-4000-8000-000000000030", exp: Math.floor(Date.now()/1000)+3600, aal: "aal1" })).toString("base64url")}.fixture`;
function req(path: string, body?: unknown) { return new Request(origin+path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
async function fixture(run: (state: any) => Promise<void>) {
  const previousFetch = globalThis.fetch, previousEnv = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: db, SUPABASE_SERVICE_ROLE_KEY: "fixture-only", NEXT_PUBLIC_SANISPA_BILLING_MODE: "live", OPENAI_API_KEY: "fixture-only" });
  const state = { active: false, partner: false, deduplicated: false, calls: [] as string[], aiCalls: 0, usage: null as any };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); state.calls.push(url.pathname);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.origin === "https://api.openai.com") {
      state.aiCalls++;
      assert.equal(body.max_completion_tokens, 1200); assert.equal(body.model, "gpt-5.4-mini");
      assert.equal(body.messages.filter((m: any) => m.role === "user" && m.content === "Mon eau est trouble").length, 1);
      return Response.json({ model: "gpt-5.4-mini-2026-03-17", usage: { prompt_tokens: 700, completion_tokens: 100 }, choices: [{ message: { content: "Précisez le volume du spa et le produit exact avant tout dosage." } }] });
    }
    assert.equal(url.origin, db, `Unexpected external call ${url.origin}`);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: uid, email: "test@example.invalid", email_confirmed_at: "2026-11-18", app_metadata: {} });
    if (url.pathname.endsWith("/rpc/private_session_status")) return Response.json({ active: true, is_admin: false, mfa_verified: false });
    if (url.pathname.endsWith("/rpc/customer_has_premium")) return Response.json(state.active);
    if (url.pathname.endsWith("/customer_subscriptions")) return Response.json(state.active ? { status: "active", paid_until: "2099-01-01" } : null);
    if (url.pathname.endsWith("/partner_users")) return Response.json(state.partner ? [{ id: "membership" }] : []);
    if (url.pathname.endsWith("/diagnostics") || url.pathname.endsWith("/client_documents")) return Response.json([]);
    if (url.pathname.endsWith("/forum_posts")) { assert.match(url.searchParams.get("or") || "", new RegExp(uid)); return Response.json([]); }
    if (url.pathname.endsWith("/customer_spas") || url.pathname.endsWith("/water_readings")) return Response.json(null);
    if (url.pathname.endsWith("/premium_ai_threads")) return init?.method === "POST" ? new Response(null, { status: 204 }) : Response.json({ id: thread });
    if (url.pathname.endsWith("/rpc/consume_request_limit")) return Response.json(true);
    if (url.pathname.endsWith("/rpc/begin_premium_ai_request")) return Response.json(state.deduplicated ? { fresh: false, state: "complete", answer: "Réponse déjà conservée." } : { fresh: true });
    if (url.pathname.endsWith("/premium_ai_requests")) {
      if (init?.method === "PATCH") { state.usage = body; return Response.json([{ id: requestId }]); }
      return Response.json([]);
    }
    throw new Error(`Unexpected database request ${url.pathname}`);
  };
  try { await run(state); }
  finally { globalThis.fetch = previousFetch; for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key]; Object.assign(process.env, previousEnv); }
}
test("free accounts cannot open paid API services, while their intervention documents remain freely accessible", () => fixture(async s => {
  for (const [get, path] of [[care, "/api/client/care"], [forum, "/api/client/forum"], [manuals, "/api/client/manuals"], [assistant, "/api/client/assistant"]] as const)
    assert.equal((await get(req(path))).status, 402);
  assert.equal((await ask(req("/api/client/assistant", { requestId, threadId: thread, topic: "eau", message: "Mon eau est trouble" }))).status, 402);
  assert.equal((await documents(req("/api/client/documents"))).status, 200);
  assert.equal(s.aiCalls, 0); assert.ok(!s.calls.some((p: string) => /care_journal|water_readings|forum_posts|spa_manuals/.test(p)));
}));
test("Premium partners still cannot enter the forum; ordinary clients cannot moderate and cannot write another client's spa", () => fixture(async s => {
  s.active = true; s.partner = true;
  assert.equal((await forum(req("/api/client/forum"))).status, 403);
  assert.equal((await moderate(req("/api/admin/forum", { id: requestId, state: "approved" }))).status, 403);
  assert.equal((await saveCare(req("/api/client/care", { action: "journal", spaId: thread, kind: "filtre", date: new Date().toISOString(), note: "Nettoyage" }))).status, 404);
  assert.equal(s.aiCalls, 0);
}));
test("Premium AI sends one bounded call, records real usage, reuses a completed request, and rejects foreign readings before any model call", () => fixture(async s => {
  s.active = true;
  const payload = { requestId, threadId: thread, topic: "eau", message: "Mon eau est trouble" };
  const first = await ask(req("/api/client/assistant", payload)); assert.equal(first.status, 200);
  assert.equal(s.aiCalls, 1); assert.deepEqual(s.usage, { state: "complete", answer: "Précisez le volume du spa et le produit exact avant tout dosage.", model: "gpt-5.4-mini-2026-03-17", input_tokens: 700, output_tokens: 100 });
  s.deduplicated = true; assert.equal((await ask(req("/api/client/assistant", payload))).status, 200); assert.equal(s.aiCalls, 1);
  assert.equal((await ask(req("/api/client/assistant", { ...payload, readingId: requestId }))).status, 404); assert.equal(s.aiCalls, 1);
}));
