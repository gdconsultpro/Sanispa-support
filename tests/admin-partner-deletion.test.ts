import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETE } from "../app/api/admin/partners/[id]/route";
import { fullDatabase } from "./helpers/full-database";

const admin = "71300000-0000-4000-8000-000000000001";
const owner = "71300000-0000-4000-8000-000000000002";
const partner = "71300000-0000-4000-8000-000000000003";
const customer = "71300000-0000-4000-8000-000000000004";

test("partner deletion is atomic, preserves existing dossiers and leaves a shared login intact", async () => {
  const db = await fullDatabase();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [admin, owner]);
    await db.query("insert into admin_users(user_id,active) values($1,true)", [admin]);
    await db.query("insert into partners(id,company_name,email) values($1,'TEST','partner@example.invalid')", [partner]);
    await db.query("select link_partner_account($1,$2,$3,'TEST')", [partner, owner, admin]);
    await db.query("insert into partner_departments(partner_id,department) values($1,'68')", [partner]);
    await db.query("insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values($1,'TEST','0000000000','client@example.invalid','TEST','TEST','2020','exterieur','230V')", [customer]);
    const dossier = (await db.query<{ id: string }>(
      "insert into diagnostics(customer_id,problem_type,choice,partner_released_at,matched_partner_ids) values($1,'fuite','intervention',now(),array[$2::uuid]) returning id",
      [customer, partner],
    )).rows[0].id;
    const deletePartner = (actor = admin) => db.query("select delete_admin_partner($1,$2)", [partner, actor]);
    await db.exec("set role authenticated");
    await assert.rejects(deletePartner(), /permission denied/);
    await db.exec("reset role; set role service_role");
    await assert.rejects(deletePartner(owner), /ADMIN_REQUIRED/);
    await assert.rejects(deletePartner(), /PARTNER_HAS_HISTORY/);
    await db.exec("reset role");
    await db.query("update diagnostics set partner_released_at=null,matched_partner_ids='{}',assigned_partner_id=$1 where id=$2", [partner, dossier]);
    await db.exec("set role service_role");
    await assert.rejects(deletePartner(), (error: { code?: string }) => error.code === "23503");
    await db.exec("reset role");
    assert.equal((await db.query("select id from partner_users where partner_id=$1 and user_id=$2",[partner,owner])).rows.length,1);
    await db.query("delete from diagnostics where id=$1", [dossier]);
    await db.exec("set role service_role");
    await deletePartner();
    await deletePartner();
    await db.exec("reset role");
    for (const table of ["partner_users", "partner_departments", "partner_access_history"]) {
      assert.equal((await db.query(`select partner_id from ${table} where partner_id=$1`, [partner])).rows.length, 0);
    }
    assert.equal((await db.query("select id from partners where id=$1",[partner])).rows.length,0);
    assert.equal((await db.query("select id from auth.users where id=$1",[owner])).rows.length,1);
  } finally {
    await db.close();
  }
});

test("partner deletion route requires MFA and same origin and reports a linked dossier as a conflict", async () => {
  const app = "https://app.example.invalid";
  const oldFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_APP_URL: app,
    NEXT_PUBLIC_SUPABASE_URL: "https://db.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
  });
  let mfa = false;
  let protectedHistory = true;
  let mutations = 0;
  const jwt = `e30.${Buffer.from(JSON.stringify({
    sub: admin, session_id: owner, role: "authenticated", aal: "aal2", exp: Math.floor(Date.now() / 1000) + 600,
  })).toString("base64url")}.fixture`;
  const remove = (origin = app) => DELETE(new Request(app + "/api/admin/partners/" + partner, {
    method: "DELETE", headers: { Authorization: `Bearer ${jwt}`, Origin: origin },
  }), { params: Promise.resolve({ id: partner }) });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user")
      return Response.json({ id: admin, email_confirmed_at: "2026-01-01" });
    if (url.pathname.endsWith("/rpc/private_session_status"))
      return Response.json({ active: true, is_admin: true, mfa_verified: mfa });
    assert.equal(url.pathname, "/rest/v1/rpc/delete_admin_partner");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_partner: partner, p_actor: admin });
    mutations++;
    return protectedHistory
      ? Response.json({ code: "23503", message: "linked data" }, { status: 409 })
      : Response.json(null);
  };
  try {
    assert.equal((await remove()).status, 403);
    mfa = true;
    assert.equal((await remove("https://elsewhere.example.invalid")).status, 403);
    assert.equal(mutations, 0);
    assert.equal((await remove()).status, 409);
    protectedHistory = false;
    const result = await remove();
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { deleted: true });
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
});
