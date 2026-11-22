import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/admin/diagnostics/[id]/archive/route";

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
