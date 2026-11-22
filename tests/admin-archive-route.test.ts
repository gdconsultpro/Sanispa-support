import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/admin/diagnostics/[id]/archive/route";
import { POST as POST_BATCH } from "../app/api/admin/diagnostics/archive/route";
import { fullDatabase } from "./helpers/full-database";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://archive-test.example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-archive-test-only";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.invalid";
const user = "00000000-0000-4000-8000-000000000001";
const session = "00000000-0000-4000-8000-000000000002";
const dossier = "00000000-0000-4000-8000-000000000003";
const origin = "https://app.example.invalid";
const token = (aal: string) => `header.${Buffer.from(JSON.stringify({
  sub: user, session_id: session, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, aal,
})).toString("base64url")}.simulated`;
const params = { params: Promise.resolve({ id: dossier }) };
const request = (payload: object, auth = token("aal2"), source = origin) => new Request(`${origin}/api/admin/diagnostics/${dossier}/archive`, {
  method: "POST", headers: { Authorization: "Bearer " + auth, Origin: source, "Content-Type": "application/json" }, body: JSON.stringify(payload),
});

test("admin removal archives and restores the exact dossier independently of status", async () => {
  const originalFetch = globalThis.fetch;
  let isAdmin = true;
  let exists = true;
  const changes: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: user, email_confirmed_at: "2026-09-01T00:00:00Z" });
    if (url.pathname === "/rest/v1/rpc/private_session_status") return Response.json({ active: true, is_admin: isAdmin, mfa_verified: true });
    assert.equal(url.pathname, "/rest/v1/diagnostics");
    assert.equal(init?.method, "PATCH");
    assert.equal(url.searchParams.get("id"), "eq." + dossier);
    assert.equal(url.searchParams.has("status"), false);
    changes.push(JSON.parse(String(init.body)));
    return Response.json(exists ? { id: dossier } : null);
  };
  try {
    isAdmin = false;
    assert.equal((await POST(request({ archived: true }), params)).status, 403);
    isAdmin = true;
    assert.equal((await POST(request({ archived: true }, token("aal1")), params)).status, 403);
    assert.equal((await POST(request({ archived: true }, token("aal2"), "https://other.example.invalid"), params)).status, 403);
    assert.equal((await POST(request({ archived: "false" }), params)).status, 400);
    assert.equal(changes.length, 0);
    assert.equal((await POST(request({ archived: true }), params)).status, 200);
    assert.match((changes[0] as { archived_at: string }).archived_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal((await POST(request({ archived: false }), params)).status, 200);
    assert.deepEqual(changes[1], { archived_at: null });
    exists = false;
    assert.equal((await POST(request({ archived: true }), params)).status, 404);
  } finally { globalThis.fetch = originalFetch; }
});

test("bulk removal checks admin, MFA and origin and submits only the selected unique IDs", async () => {
  const originalFetch = globalThis.fetch;
  const selected = [dossier, "00000000-0000-4000-8000-000000000004"];
  let isAdmin = true;
  const mutations: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: user, email_confirmed_at: "2026-09-01T00:00:00Z" });
    if (url.pathname === "/rest/v1/rpc/private_session_status") return Response.json({ active: true, is_admin: isAdmin, mfa_verified: true });
    assert.equal(url.pathname, "/rest/v1/rpc/archive_admin_diagnostics");
    mutations.push(JSON.parse(String(init?.body)));
    return Response.json(2);
  };
  try {
    isAdmin = false;
    assert.equal((await POST_BATCH(request({ ids: selected }))).status, 403);
    isAdmin = true;
    assert.equal((await POST_BATCH(request({ ids: selected }, token("aal1")))).status, 403);
    assert.equal((await POST_BATCH(request({ ids: selected }, token("aal2"), "https://other.example.invalid"))).status, 403);
    assert.equal((await POST_BATCH(request({ ids: [] }))).status, 400);
    assert.equal((await POST_BATCH(request({ ids: [...selected, "invalid"] }))).status, 400);
    assert.equal(mutations.length, 0);
    const result = await POST_BATCH(request({ ids: [...selected, selected[0]] }));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { archived: 2 });
    assert.deepEqual(mutations, [{ p_actor: user, p_ids: selected }]);
  } finally { globalThis.fetch = originalFetch; }
});

test("bulk archiving is repeatable, affects only selected dossiers and retains their status", async () => {
  const db = await fullDatabase();
  const other = "00000000-0000-4000-8000-000000000075";
  const untouched = "00000000-0000-4000-8000-000000000076";
  const customer = "00000000-0000-4000-8000-000000000077";
  const archive = (actor: string, ids: string[]) => db.query("select public.archive_admin_diagnostics($1,$2) as archived", [actor, ids]);
  try {
    await db.exec(`
      insert into auth.users(id,email) values ('${user}','admin@example.invalid'), ('${session}','other@example.invalid');
      insert into public.admin_users(user_id) values ('${user}');
      insert into public.customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)
      values ('${customer}','Fictif','0000000000','client@example.invalid','','','','exterieur','230V');
      insert into public.diagnostics(id,customer_id,problem_type,status) values
       ('${dossier}','${customer}','fuite','AVAILABLE'), ('${other}','${customer}','fuite','CLOSED'), ('${untouched}','${customer}','fuite','AVAILABLE');
    `);
    await assert.rejects(archive(session, [dossier, other]), /ADMIN_REQUIRED/);
    assert.deepEqual((await archive(user, [dossier, other, other])).rows, [{ archived: 2 }]);
    assert.deepEqual((await archive(user, [dossier, other])).rows, [{ archived: 0 }]);
    assert.deepEqual((await db.query("select status, archived_at is not null as archived from diagnostics where id=$1", [other])).rows, [{ status: "CLOSED", archived: true }]);
    assert.deepEqual((await db.query("select archived_at from diagnostics where id=$1", [untouched])).rows, [{ archived_at: null }]);
  } finally { await db.close(); }
});
