import assert from "node:assert/strict";
import { test } from "node:test";
import { fullDatabase } from "./helpers/full-database";
import { POST } from "../app/api/admin/clients/[id]/route";

const admin = "95700000-0000-4000-8000-000000000001";
const buyer = "95700000-0000-4000-8000-000000000002";
const unconfirmed = "95700000-0000-4000-8000-000000000003";
const professional = "95700000-0000-4000-8000-000000000004";
const shared = "95700000-0000-4000-8000-000000000005";
const company = "95700000-0000-4000-8000-000000000006";
const activeSession = "95700000-0000-4000-8000-000000000007";

test("client directory includes accounts without profiles and protects shared identities and records", async () => {
  const db = await fullDatabase();
  try {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values " +
      "($1,'admin@example.invalid',now(),'{}'), ($2,'buy@example.invalid',now(),'{}')," +
      "($3,'pending@example.invalid',null,$6), ($4,'professional@example.invalid',null,$7)," +
      "($5,'shared@example.invalid',now(),$6)",
      [admin, buyer, unconfirmed, professional, shared, { sanispa_signup_audience: "customer" }, { sanispa_signup_audience: "partner" }],
    );
    await db.query("insert into admin_users(user_id) values($1)", [admin]);
    await db.query("insert into partners(id,company_name,email) values($1,'TEST','shared@example.invalid')", [company]);
    await db.query("select link_partner_account($1,$2,$3,'Contact fictif')", [company, shared, admin]);
    await db.query("insert into client_profiles(user_id,email,first_name,last_name) values ($1,'buy@example.invalid','Camille','Fictif')", [buyer]);
    await db.query("insert into auth.sessions(id,user_id,aal) values($1,$2,'aal1')", [activeSession, buyer]);
    await db.query(
      "with client as (insert into customers(name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)" +
      " values ('TEST','0600000000','buy@example.invalid','TEST','TEST','2022','exterieur','230V') returning id)" +
      " insert into diagnostics(customer_id,user_id,problem_type,choice) select id,$1,'fuite','intervention' from client", [buyer],
    );
    const list = (query = "", actor = admin) => db.query<{ directory: { total: number; accounts: Array<{ id: string; shared_access: boolean; banned_until: string | null }> } }>(
      "select list_admin_customer_accounts($1,$2,1) as directory", [actor, query],
    ).then(result => result.rows[0].directory);
    const manage = (id: string, action: string, actor = admin) => db.query(
      "select manage_admin_customer_account($1,$2,$3)", [actor, id, action],
    );
    await db.exec("set role authenticated");
    await assert.rejects(list(), /permission denied/);
    await assert.rejects(manage(buyer, "block"), /permission denied/);
    await db.exec("reset role; set role service_role");
    await assert.rejects(list("", buyer), /ADMIN_REQUIRED/);
    await assert.rejects(manage(buyer, "delete", buyer), /ADMIN_REQUIRED/);
    const directory = await list();
    assert.equal(directory.total, 3);
    assert.deepEqual(new Set(directory.accounts.map(row => row.id)), new Set([buyer, unconfirmed, shared]));
    assert.equal(directory.accounts.find(row => row.id === shared)?.shared_access, true);
    assert.equal((await list("fictif")).accounts[0].id, buyer);
    await assert.rejects(manage(shared, "block"), /ACCOUNT_SHARED/);
    await assert.rejects(manage(professional, "delete"), /ACCOUNT_NOT_FOUND/);
    await assert.rejects(manage(buyer, "delete"), /ACCOUNT_HAS_HISTORY/);
    await manage(buyer, "block");
    assert.ok((await list("buy@")).accounts[0].banned_until);
    assert.equal((await db.query<{ status: { active: boolean } }>(
      "select private_session_status($1,$2) as status", [buyer, activeSession],
    )).rows[0].status.active, false);
    await manage(buyer, "unblock");
    assert.equal((await list("buy@")).accounts[0].banned_until, null);
    await manage(unconfirmed, "delete");
    await manage(unconfirmed, "delete");
    assert.equal((await list()).total, 2);
  } finally {
    await db.close();
  }
});

test("client administration actions require verified MFA and reject cross-origin requests", async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  const app = "https://app.example.invalid";
  Object.assign(process.env, { NEXT_PUBLIC_APP_URL: app, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" });
  const token = "e30." + Buffer.from(JSON.stringify({
    sub: admin, session_id: activeSession, role: "authenticated", aal: "aal2", exp: Math.floor(Date.now() / 1000) + 600,
  })).toString("base64url") + ".fixture";
  let mfa = false;
  let mutations = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Response.json({ id: admin, email_confirmed_at: "2026-01-01" });
    if (url.pathname.endsWith("/rpc/private_session_status")) return Response.json({ active: true, is_admin: true, mfa_verified: mfa });
    assert.equal(url.pathname, "/rest/v1/rpc/manage_admin_customer_account");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_actor: admin, p_user: buyer, p_action: "block" });
    mutations++;
    return Response.json(null);
  };
  const apply = (origin: string) => POST(new Request(app + "/api/admin/clients/" + buyer, {
    method: "POST", headers: { Authorization: "Bearer " + token, Origin: origin }, body: JSON.stringify({ action: "block" }),
  }), { params: Promise.resolve({ id: buyer }) });
  try {
    assert.equal((await apply(app)).status, 403);
    mfa = true;
    assert.equal((await apply("https://other.example.invalid")).status, 403);
    assert.equal(mutations, 0);
    assert.equal((await apply(app)).status, 200);
    assert.equal(mutations, 1);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
});
