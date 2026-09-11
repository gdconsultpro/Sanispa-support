import { test } from "node:test";
import assert from "node:assert/strict";
import { PATCH } from "../app/api/admin/partners/[id]/billing/route";

const testOrigin = "https://partner-billing-admin.example.invalid";
const appOrigin = "https://app.example.invalid";
const administratorId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000050";
const partnerId = "00000000-0000-4000-8000-000000000010";
const params = { params: Promise.resolve({ id: partnerId }) };
const fixturePartner = {
  id: partnerId,
  company_name: "Partenaire fictif — transport local",
  contact_name: null,
  email: "partner@example.invalid",
  phone: null,
  address: null,
  postal_code: null,
  city: null,
  active: true,
  created_at: "2026-09-01T00:00:00Z",
  partner_departments: [{ department: "90" }, { department: "67" }]
};

function request(body: unknown) {
  const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({
    sub: administratorId, session_id: sessionId, role: "authenticated", aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url")}.simulated-local-only`;
  return new Request(`${appOrigin}/api/admin/partners/${partnerId}/billing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: appOrigin, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

type FixtureState = {
  isAdmin: boolean;
  leadsPaid: boolean;
  rpcError: string | null;
  readError: boolean;
  omitMode: boolean;
  writes: Array<Record<string, unknown>>;
  reads: number;
};

async function withLocalTransport(run: (state: FixtureState) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const environment = {
    NEXT_PUBLIC_SUPABASE_URL: testOrigin,
    SUPABASE_SERVICE_ROLE_KEY: "partner-billing-admin-local-test-only",
    NEXT_PUBLIC_APP_URL: appOrigin
  };
  const previousEnvironment = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  const state: FixtureState = { isAdmin: true, leadsPaid: true, rpcError: null, readError: false, omitMode: false, writes: [], reads: 0 };
  const unexpectedRequests: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== testOrigin) {
      unexpectedRequests.push(url.href);
      throw new Error("Network access outside the local transport fixture is forbidden.");
    }
    if (url.pathname === "/auth/v1/user") {
      return Response.json({ id: administratorId, email_confirmed_at: "2026-09-01T00:00:00Z" });
    }
    if (url.pathname === "/rest/v1/rpc/private_session_status") {
      return Response.json({ active: true, is_admin: state.isAdmin, mfa_verified: true });
    }
    if (url.pathname === "/rest/v1/rpc/set_partner_leads_paid") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      state.writes.push(body);
      if (state.rpcError) return Response.json({ code: "P0001", message: state.rpcError }, { status: 400 });
      assert.equal(typeof body.p_value, "boolean");
      state.leadsPaid = body.p_value as boolean;
      return Response.json({ partner_id: partnerId, leads_paid: state.leadsPaid });
    }
    if (url.pathname === "/rest/v1/partners") {
      state.reads += 1;
      assert.equal(url.searchParams.get("id"), `eq.${partnerId}`);
      assert.equal(url.searchParams.get("select"), "*,partner_departments(department)");
      if (state.readError) return Response.json({ code: "P0001", message: "SIMULATED_PARTNER_READ_ERROR" }, { status: 400 });
      return Response.json({ ...fixturePartner, ...(state.omitMode ? {} : { leads_paid: state.leadsPaid }) });
    }
    unexpectedRequests.push(url.href);
    throw new Error(`Unexpected operation in local transport: ${url.pathname}`);
  };

  try {
    await run(state);
    assert.deepEqual(unexpectedRequests, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("partner billing: administrator can save free then paid mode, with server actor and confirmed partner", async () => {
  await withLocalTransport(async state => {
    for (const leadsPaid of [false, true]) {
      const response = await PATCH(request({ leads_paid: leadsPaid }), params);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), {
        partner: { ...fixturePartner, leads_paid: leadsPaid, departments: ["67", "90"] }
      });
      assert.equal(state.leadsPaid, leadsPaid);
    }
    assert.deepEqual(state.writes, [false, true].map(value => ({ p_partner: partnerId, p_value: value, p_actor: administratorId })));
    assert.equal(state.reads, 2);
  });
});

test("partner billing: an authenticated partner without administrator rights cannot change its billing mode", async () => {
  await withLocalTransport(async state => {
    state.isAdmin = false;
    const response = await PATCH(request({ leads_paid: false }), params);
    assert.equal(response.status, 403);
    assert.equal("partner" in await response.json(), false);
    assert.deepEqual(state.writes, []);
    assert.equal(state.reads, 0);
    assert.equal(state.leadsPaid, true);
  });
});

test("partner billing: forged actor, unknown fields and non-boolean mode are rejected before mutation", async () => {
  await withLocalTransport(async state => {
    for (const body of [
      { leads_paid: false, actor: "00000000-0000-4000-8000-000000000099" },
      { leads_paid: false, p_actor: "00000000-0000-4000-8000-000000000099" },
      { leads_paid: false, active: true },
      { leads_paid: "false" }
    ]) {
      const response = await PATCH(request(body), params);
      assert.equal(response.status, 400);
      assert.equal("partner" in await response.json(), false);
    }
    assert.deepEqual(state.writes, []);
    assert.equal(state.reads, 0);
    assert.equal(state.leadsPaid, true);
  });
});

test("partner billing: failed database mutations keep the fixture mode unchanged and never return success", async () => {
  await withLocalTransport(async state => {
    for (const [message, status] of [
      ["ADMIN_REQUIRED", 403], ["PARTNER_NOT_FOUND", 404], ["INVALID_BILLING_SETTING", 400], ["SIMULATED_DATABASE_FAILURE", 503]
    ] as const) {
      state.rpcError = message;
      const response = await PATCH(request({ leads_paid: false }), params);
      assert.equal(response.status, status);
      const payload = await response.json();
      assert.equal(typeof payload.error, "string");
      assert.equal("partner" in payload, false);
      assert.equal(state.leadsPaid, true);
    }
    assert.equal(state.writes.length, 4);
    assert.equal(state.reads, 0);
  });
});

test("partner billing: an unreadable or incomplete confirmation never reports a successful save", async () => {
  await withLocalTransport(async state => {
    for (const failure of ["readError", "omitMode"] as const) {
      state.readError = failure === "readError";
      state.omitMode = failure === "omitMode";
      const response = await PATCH(request({ leads_paid: false }), params);
      assert.equal(response.status, 503);
      assert.equal("partner" in await response.json(), false);
      // The write succeeded, but the response deliberately does not claim a confirmed result.
      assert.equal(state.leadsPaid, false);
    }
    assert.equal(state.writes.length, 2);
    assert.equal(state.reads, 2);
  });
});
