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
const manualId = "40000000-0000-4000-8000-000000000040";
const token = `e30.${Buffer.from(JSON.stringify({ sub: uid, role: "authenticated", session_id: "40000000-0000-4000-8000-000000000030", exp: Math.floor(Date.now()/1000)+3600, aal: "aal1" })).toString("base64url")}.fixture`;
function req(path: string, body?: unknown) { return new Request(origin+path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
async function fixture(run: (state: any) => Promise<void>) {
  const previousFetch = globalThis.fetch, previousEnv = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: db, SUPABASE_SERVICE_ROLE_KEY: "fixture-only", NEXT_PUBLIC_SANISPA_BILLING_MODE: "live", OPENAI_API_KEY: "fixture-only" });
  const state = { active: false, partner: false, deduplicated: false, calls: [] as string[], aiCalls: 0, usage: null as any, reminder: null as any, history: [] as { message: string; answer: string }[] };
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
    if (url.pathname.endsWith("/spa_manuals")) {
      assert.equal(url.searchParams.get("language"), "eq.fr");
      assert.equal(url.searchParams.get("active"), "eq.true");
      return Response.json([{ id: manualId, brand: "Gecko", model: "in.k300", title: "Fiche utilisateur en français" }]);
    }
    if (url.pathname.endsWith("/rpc/consume_request_limit")) return Response.json(true);
    if (url.pathname.endsWith("/care_reminders") && init?.method === "PATCH") {
      const row = state.reminder;
      assert.equal(url.searchParams.get("user_id"), `eq.${uid}`);
      assert.equal(url.searchParams.get("completed_at"), "is.null");
      if (!row || url.searchParams.get("id") !== `eq.${row.id}` ||
        url.searchParams.get("version") !== `eq.${row.version}` ||
        row.user_id !== uid || row.completed_at) return Response.json([]);
      Object.assign(row, body);
      return Response.json([{ id: row.id }]);
    }
    if (url.pathname.endsWith("/rpc/begin_premium_ai_request")) return Response.json(state.deduplicated ? { fresh: false, state: "complete", answer: "Réponse déjà conservée." } : { fresh: true });
    if (url.pathname.endsWith("/premium_ai_requests")) {
      if (init?.method === "PATCH") { state.usage = body; return Response.json([{ id: requestId }]); }
      assert.equal(url.searchParams.get("user_id"), `eq.${uid}`);
      assert.equal(url.searchParams.get("thread_id"), `eq.${thread}`);
      return Response.json(state.history);
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

test("a zero bromine measurement with pH 7.6 prioritizes verification and asks about activation without a model call", () => fixture(async s => {
  s.active = true;
  const response = await ask(req("/api/client/assistant", {
    requestId, threadId: thread, topic: "eau",
    message: "Mon brome est à 0 malgré 2 galets de 20 g pour 1000 L et le pH est à 7,6.",
  }));
  assert.equal(response.status, 200);
  const { answer } = await response.json();
  assert.match(answer, /pH de 7,6 peut être dans la plage/);
  assert.match(answer, /déjà utilisé un brome choc ou un activateur compatible/);
  assert.match(answer, /avant la baignade/);
  assert.equal(s.aiCalls, 0);
  assert.equal(s.usage.input_tokens, 0);
  assert.equal(s.usage.output_tokens, 0);
}));

test("notice lookup returns a catalog entry, reuses the previous reference, and never substitutes it for a new unknown model", () => fixture(async s => {
  s.active = true;
  delete process.env.OPENAI_API_KEY;
  const notice = async (message: string) => {
    const response = await ask(req("/api/client/assistant", { requestId, threadId: thread, topic: "notices", message }));
    assert.equal(response.status, 200);
    return (await response.json()).answer as string;
  };
  for (const message of ["Je cherche un Gecko IN K 300", "notice"]) {
    const answer = await notice(message);
    assert.ok(answer.includes(`/premium/notices?ref=${manualId}`));
    s.history.unshift({ message, answer });
  }
  const unknown = await notice("Correction, ma référence est IN.K300S");
  assert.match(unknown, /pas trouvé de notice en français vérifiée/);
  s.history.unshift({ message: "Correction, ma référence est IN.K300S", answer: unknown });
  assert.doesNotMatch(await notice("La notice SVP"), /ref=/);
  assert.equal(s.aiCalls, 0);
}));

test("an active reminder keeps its identity and rejects stale or foreign edits", () => fixture(async s => {
  s.active = true;
  s.reminder = {
    id: requestId, user_id: uid, completed_at: null, version: 1,
    title: "Changer le filtre", repeat_days: 30, due_at: "2026-11-30T09:00:00Z",
  };
  const edit = {
    action: "edit-reminder", id: requestId, version: 1, date: "2026-12-12T11:00:00Z",
    repeatDays: null, repeatMonths: 2,
  };
  const submitEdit = (payload: unknown) => saveCare(req("/api/client/care", payload));
  assert.equal((await submitEdit({ ...edit, repeatYears: 1 })).status, 400);
  assert.equal((await submitEdit(edit)).status, 200);
  assert.equal(s.reminder.id, requestId);
  assert.equal(s.reminder.title, "Changer le filtre");
  assert.equal(s.reminder.due_at, edit.date);
  assert.equal(s.reminder.repeat_months, 2);
  assert.equal(s.reminder.repeat_days, null);
  assert.equal(s.reminder.version, 2);
  assert.equal((await submitEdit(edit)).status, 409);
  s.reminder.user_id = thread;
  assert.equal((await submitEdit({ ...edit, version: 2 })).status, 409);
  s.reminder.user_id = uid;
  s.reminder.completed_at = edit.date;
  assert.equal((await submitEdit({ ...edit, version: 2 })).status, 409);
}));
