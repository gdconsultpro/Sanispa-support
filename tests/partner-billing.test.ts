import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// These checks use an in-memory database only. No payment, Auth or email transport.
const migration = "supabase/migrations/20260911111209_partner_billing_terms.sql";
const admin = "00000000-0000-4000-8000-000000000001";
const userA = "00000000-0000-4000-8000-000000000002";
const userB = "00000000-0000-4000-8000-000000000003";
const inactiveAdmin = "00000000-0000-4000-8000-000000000004";
const partnerA = "00000000-0000-4000-8000-000000000010";
const partnerB = "00000000-0000-4000-8000-000000000011";
const diagnostic = "00000000-0000-4000-8000-000000000020";
const secondDiagnostic = "00000000-0000-4000-8000-000000000021";
const absent = "00000000-0000-4000-8000-000000000099";
const historicalPaid = "00000000-0000-4000-8000-000000000030";
const historicalExpired = "00000000-0000-4000-8000-000000000031";

type Purchase = {
  id: string; request_id: string; partner_id: string; status: string; amount: number;
  payment_required: boolean; stripe_price_id: string | null; currency: string;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  stripe_payment_id: string | null; paid_at: string | null; locked_until: string | null;
};
type Acquisition = { kind: "assigned" | "checkout"; purchase: Purchase | null; resumed: boolean };

function originalCreateTable(schema: string, name: string) {
  const statement = schema.match(new RegExp(`create table if not exists ${name} \\([\\s\\S]*?\\n\\);`));
  assert(statement, `Missing existing table ${name}`);
  return statement[0];
}

async function database(withHistoricalPurchases = false) {
  const db = new PGlite();
  const schema = await readFile("supabase/schema.sql", "utf8");
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    ${originalCreateTable(schema, "partners")}
    ${originalCreateTable(schema, "partner_users")}
    create table public.admin_users (user_id uuid primary key references auth.users(id), active boolean not null default true, created_at timestamptz not null default now());
    create table public.diagnostics (
      id uuid primary key, created_at timestamptz not null default now(),
      status text not null default 'AVAILABLE', request_type text not null default 'TECHNICAL_REQUEST',
      matched_partner_ids uuid[] not null default '{}', archived_at timestamptz,
      assigned_partner_id uuid references partners(id), assigned_at timestamptz, lead_locked_until timestamptz
    );
    ${originalCreateTable(schema, "lead_purchases")}
    create unique index lead_purchases_stripe_checkout_session_idx on lead_purchases(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
    create unique index lead_purchases_one_paid_per_request_idx on lead_purchases(request_id) where status = 'paid';
    create table public.diagnostic_activity (
      id uuid primary key default gen_random_uuid(), diagnostic_id uuid references diagnostics(id),
      actor text not null, status text not null, created_at timestamptz not null default now(),
      event_type text, old_status text, metadata jsonb
    );
    alter table partners enable row level security;
    alter table partner_users enable row level security;
    alter table admin_users enable row level security;
    alter table diagnostics enable row level security;
    alter table lead_purchases enable row level security;
    alter table diagnostic_activity enable row level security;
  `);
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [admin, userA, userB, inactiveAdmin]);
  await db.query("insert into admin_users(user_id,active) values($1,true),($2,false)", [admin, inactiveAdmin]);
  await db.query("insert into partners(id,company_name,email) values($1,'Partenaire fictif A','a@example.invalid'),($2,'Partenaire fictif B','b@example.invalid')", [partnerA, partnerB]);
  await db.query("insert into partner_users(partner_id,user_id) values($1,$2),($3,$4)", [partnerA, userA, partnerB, userB]);
  await db.query("insert into diagnostics(id,matched_partner_ids) values($1,$3),($2,$3)", [diagnostic, secondDiagnostic, [partnerA, partnerB]]);
  if (withHistoricalPurchases) {
    await db.query(`insert into lead_purchases(id,request_id,partner_id,status,amount,stripe_checkout_session_id,stripe_payment_intent_id,paid_at,purchased_at)
      values($1,$2,$3,'paid',1000,'cs_legacy_paid','pi_legacy','2026-09-01T10:00:00Z','2026-09-01T09:55:00Z')`, [historicalPaid, diagnostic, partnerA]);
    await db.query("update diagnostics set assigned_partner_id=$2,assigned_at='2026-09-01T10:00:00Z',status='ASSIGNED' where id=$1", [diagnostic, partnerA]);
    await db.query(`insert into lead_purchases(id,request_id,partner_id,status,amount,stripe_checkout_session_id,locked_until,purchased_at)
      values($1,$2,$3,'expired',1000,'cs_legacy_expired',null,'2026-09-01T11:00:00Z')`, [historicalExpired, secondDiagnostic, partnerA]);
  }
  const before = (await db.query("select * from lead_purchases order by id")).rows;
  await db.exec(await readFile(migration, "utf8"));
  return { db, before };
}

async function setting(db: PGlite, value: boolean | null, partner = partnerA, actor = admin) {
  return (await db.query<{ partner: { leads_paid: boolean } }>("select set_partner_leads_paid($1,$2,$3) partner", [partner, value, actor])).rows[0].partner;
}
async function acquire(db: PGlite, options: { id?: string; partner?: string; actor?: string; price?: string | null; amount?: number | null; currency?: string | null } = {}) {
  return (await db.query<{ acquisition: Acquisition }>("select prepare_partner_acquisition($1,$2,$3,$4,$5,$6) acquisition", [
    options.id ?? diagnostic, options.partner ?? partnerA, options.actor ?? userA,
    options.price === undefined ? "price_fixture" : options.price,
    options.amount === undefined ? 1000 : options.amount,
    options.currency === undefined ? "eur" : options.currency,
  ])).rows[0].acquisition;
}
async function attach(db: PGlite, purchase: Purchase, session: string | null) {
  return (await db.query<{ purchase: Purchase }>("select attach_partner_checkout($1,$2,$3,$4) purchase", [purchase.id, purchase.partner_id, purchase.request_id, session])).rows[0].purchase;
}
async function finish(db: PGlite, purchase: Purchase, session: string | null, state = "expired") {
  return (await db.query<{ purchase: Purchase }>("select finish_partner_checkout($1,$2,$3,$4,$5) purchase", [purchase.id, purchase.partner_id, purchase.request_id, session, state])).rows[0].purchase;
}
async function pay(db: PGlite, purchase: Purchase, session: string, paidAt = "2026-09-11T12:00:00Z") {
  return db.query("select apply_partner_payment($1,$2,$3,$4,$5,$6)", [session, purchase.id, purchase.partner_id, purchase.request_id, "pi_fixture", paidAt]);
}
async function dossier(db: PGlite, id = diagnostic) {
  return (await db.query<{ assigned_partner_id: string | null; assigned_at: Date | null; status: string; lead_locked_until: Date | null }>("select assigned_partner_id,assigned_at,status,lead_locked_until from diagnostics where id=$1", [id])).rows[0];
}

test("migration preserves old purchases and defaults existing and new partners to paid leads", async () => {
  const { db, before } = await database(true);
  try {
    const after = (await db.query<Record<string, unknown>>("select * from lead_purchases order by id")).rows;
    after.forEach(row => {
      assert.equal(row.payment_required, true); assert.equal(row.stripe_price_id, null); assert.equal(row.currency, "eur");
      delete row.payment_required; delete row.stripe_price_id; delete row.currency;
    });
    assert.deepEqual(after, before);
    assert((await db.query<{ leads_paid: boolean }>("select leads_paid from partners")).rows.every(row => row.leads_paid));
    const added = (await db.query<{ leads_paid: boolean }>("insert into partners(company_name,email) values('Nouveau fictif','new@example.invalid') returning leads_paid")).rows[0];
    assert.equal(added.leads_paid, true);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from partner_lead_terms_history")).rows[0].n, 0);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from pg_indexes where indexname in ('lead_purchases_one_paid_per_request_idx','lead_purchases_one_acquisition_per_request_idx')")).rows[0].n, 2);
  } finally { await db.close(); }
});

test("only an active administrator can change terms, and real changes create an atomic dated audit", async () => {
  const { db } = await database();
  try {
    await db.exec("set role service_role");
    assert.equal((await setting(db, false)).leads_paid, false);
    await setting(db, false);
    assert.equal((await setting(db, true)).leads_paid, true);
    const history = (await db.query<{ actor: string; old_leads_paid: boolean; new_leads_paid: boolean; created_at: Date }>("select actor,old_leads_paid,new_leads_paid,created_at from partner_lead_terms_history order by created_at,id")).rows;
    assert.equal(history.length, 2); assert(history.every(row => row.actor === admin && Number.isFinite(new Date(row.created_at).getTime())));
    assert(history.some(row => row.old_leads_paid && !row.new_leads_paid));
    assert(history.some(row => !row.old_leads_paid && row.new_leads_paid));
    await assert.rejects(setting(db, false, partnerA, inactiveAdmin), /ADMIN_REQUIRED/);
    await assert.rejects(setting(db, false, partnerA, userA), /ADMIN_REQUIRED/);
    await assert.rejects(setting(db, null), /INVALID_BILLING_SETTING/);
    await assert.rejects(setting(db, false, absent), /PARTNER_NOT_FOUND/);
    await db.exec(`reset role;
      create function fail_terms_audit() returns trigger language plpgsql as $$ begin raise exception 'AUDIT_FAILED'; end; $$;
      create trigger fail_terms_audit before insert on partner_lead_terms_history for each row execute function fail_terms_audit();
      set role service_role;`);
    await assert.rejects(setting(db, false), /AUDIT_FAILED/);
    assert.equal((await db.query<{ leads_paid: boolean }>("select leads_paid from partners where id=$1", [partnerA])).rows[0].leads_paid, true);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from partner_lead_terms_history")).rows[0].n, 2);
  } finally { await db.close(); }
});

test("a free acquisition assigns exactly once without any Stripe fields and remains free after a terms change", async () => {
  const { db } = await database();
  try {
    await db.exec("set role service_role");
    await setting(db, false);
    const first = await acquire(db, { price: null, amount: null });
    assert.equal(first.kind, "assigned"); assert.equal(first.resumed, false);
    assert(first.purchase); assert.equal(first.purchase.status, "granted"); assert.equal(first.purchase.payment_required, false);
    assert.equal(first.purchase.amount, 0); assert.equal(first.purchase.currency, "eur");
    for (const key of ["stripe_checkout_session_id", "stripe_payment_id", "stripe_payment_intent_id", "stripe_price_id", "paid_at", "locked_until"] as const) assert.equal(first.purchase[key], null);
    const assigned = await dossier(db); assert.equal(assigned.assigned_partner_id, partnerA); assert.equal(assigned.status, "ASSIGNED"); assert(assigned.assigned_at); assert.equal(assigned.lead_locked_until, null);
    await setting(db, true);
    const again = await acquire(db, { price: null, amount: null });
    assert.deepEqual(again, { kind: "assigned", purchase: first.purchase, resumed: true });
    assert.deepEqual(await dossier(db), assigned);
    await assert.rejects(acquire(db, { partner: partnerB, actor: userB }), /LEAD_UNAVAILABLE/);
    await db.exec("reset role");
    const events = (await db.query<{ actor: string; event_type: string; old_status: string; metadata: { payment_required: boolean; partner_id: string } }>("select actor,event_type,old_status,metadata from diagnostic_activity")).rows;
    assert.equal(events.length, 1); assert.equal(events[0].actor, userA); assert.equal(events[0].event_type, "partner_assigned");
    assert.equal(events[0].old_status, "AVAILABLE"); assert.equal(events[0].metadata.payment_required, false); assert.equal(events[0].metadata.partner_id, partnerA);
  } finally { await db.close(); }
});

test("paid reservations retain their terms after toggling free and after the local lock expires", async () => {
  const { db } = await database();
  try {
    const first = await acquire(db, { price: "price_original", amount: 1200 });
    assert.equal(first.kind, "checkout"); assert.equal(first.resumed, false); assert(first.purchase);
    assert.equal(first.purchase.payment_required, true); assert.equal(first.purchase.status, "pending");
    assert.equal((await dossier(db)).assigned_partner_id, null);
    await attach(db, first.purchase, "cs_original");
    await setting(db, false); await setting(db, false, partnerB);
    await db.query("update diagnostics set lead_locked_until=now()-interval '1 hour' where id=$1", [diagnostic]);
    await db.query("update lead_purchases set locked_until=now()-interval '1 hour' where id=$1", [first.purchase.id]);
    const resumed = await acquire(db, { price: null, amount: null });
    assert.equal(resumed.kind, "checkout"); assert.equal(resumed.resumed, true); assert.equal(resumed.purchase?.id, first.purchase.id);
    assert.equal(resumed.purchase?.payment_required, true); assert.equal(resumed.purchase?.amount, 1200); assert.equal(resumed.purchase?.stripe_price_id, "price_original"); assert.equal(resumed.purchase?.stripe_checkout_session_id, "cs_original");
    await assert.rejects(acquire(db, { partner: partnerB, actor: userB, price: null, amount: null }), /LEAD_RESERVED/);
    await pay(db, first.purchase, "cs_original");
    assert.equal((await dossier(db)).assigned_partner_id, partnerA);
    assert.equal((await acquire(db)).purchase?.status, "paid");
    assert.equal((await db.query<{ leads_paid: boolean }>("select leads_paid from partners where id=$1", [partnerA])).rows[0].leads_paid, false);
  } finally { await db.close(); }
});

test("an unknown pending checkout cannot be released or changed into a free acquisition", async () => {
  const { db } = await database();
  try {
    const pending = (await acquire(db)).purchase!;
    await setting(db, false);
    await assert.rejects(finish(db, pending, null, "failed"), /SESSION_MISMATCH/);
    await assert.rejects(finish(db, pending, "cs_not_attached", "expired"), /SESSION_MISMATCH/);
    const resumed = await acquire(db, { price: null, amount: null });
    assert.equal(resumed.kind, "checkout"); assert.equal(resumed.purchase?.id, pending.id);
    assert.equal((await dossier(db)).assigned_partner_id, null);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from lead_purchases")).rows[0].n, 1);
  } finally { await db.close(); }
});

test("retries use new purchase ids and old sessions cannot change or release a later reservation", async () => {
  const { db } = await database();
  try {
    const old = (await acquire(db, { price: "price_old", amount: 1000 })).purchase!;
    await attach(db, old, "cs_old");
    assert.equal((await finish(db, old, "cs_old")).status, "expired");
    assert.equal((await dossier(db)).lead_locked_until, null);
    const current = (await acquire(db, { price: "price_new", amount: 1400 })).purchase!;
    assert.notEqual(current.id, old.id);
    await attach(db, current, "cs_new");
    const locked = await dossier(db);
    assert.equal((await finish(db, old, "cs_old", "failed")).status, "expired");
    assert.deepEqual(await dossier(db), locked);
    await assert.rejects(attach(db, old, "cs_very_old"), /LEAD_UNAVAILABLE/);
    await assert.rejects(pay(db, old, "cs_old"), /PURCHASE_NOT_PENDING/);
    await assert.rejects(finish(db, current, "cs_old"), /SESSION_MISMATCH/);
    await assert.rejects(attach(db, current, "cs_replacement"), /SESSION_MISMATCH/);
    await pay(db, current, "cs_new");
    assert.equal((await dossier(db)).assigned_partner_id, partnerA);
    const rows = (await db.query<{ id: string; status: string; stripe_price_id: string; amount: number }>("select id,status,stripe_price_id,amount from lead_purchases order by purchased_at,id")).rows;
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.find(row => row.id === old.id), { id: old.id, status: "expired", stripe_price_id: "price_old", amount: 1000 });
    assert.deepEqual(rows.find(row => row.id === current.id), { id: current.id, status: "paid", stripe_price_id: "price_new", amount: 1400 });
  } finally { await db.close(); }
});

test("a settled paid acquisition is idempotent and neither changed nor refunded by toggling billing", async () => {
  const { db } = await database(true);
  try {
    const before = (await db.query("select * from lead_purchases where id=$1", [historicalPaid])).rows[0];
    const assignedBefore = await dossier(db);
    const purchase = (await acquire(db)).purchase!;
    await setting(db, false); await setting(db, true);
    await pay(db, purchase, "cs_legacy_paid", "2030-01-01T00:00:00Z");
    assert.equal((await finish(db, purchase, "cs_legacy_paid")).status, "paid");
    await assert.rejects(pay(db, purchase, "cs_incorrect"), /SESSION_MISMATCH/);
    assert.deepEqual((await db.query("select * from lead_purchases where id=$1", [historicalPaid])).rows[0], before);
    assert.deepEqual(await dossier(db), assignedBefore);
  } finally { await db.close(); }
});

test("free and paid acquisitions share exclusive ownership and free ones never accept a payment", async () => {
  const { db } = await database();
  try {
    await setting(db, false); await setting(db, false, partnerB);
    // PGlite serializes calls; this checks both contenders' outcomes, not a multi-connection load test.
    const contenders = await Promise.allSettled([
      acquire(db, { partner: partnerA, actor: userA }), acquire(db, { partner: partnerB, actor: userB }),
    ]);
    assert.equal(contenders.filter(result => result.status === "fulfilled").length, 1);
    const success = (contenders.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Acquisition>).value;
    const granted = success.purchase!;
    await assert.rejects(pay(db, granted, "cs_forged"), /PAYMENT_NOT_REQUIRED/);
    await assert.rejects(attach(db, granted, "cs_forged"), /LEAD_UNAVAILABLE/);
    await assert.rejects(finish(db, granted, "cs_forged"), /SESSION_MISMATCH/);
    await assert.rejects(db.query("insert into lead_purchases(request_id,partner_id,status,amount) values($1,$2,'paid',1000)", [diagnostic, granted.partner_id === partnerA ? partnerB : partnerA]), /unique constraint/);
    await assert.rejects(db.query("insert into lead_purchases(request_id,partner_id,status,amount,payment_required) values($1,$2,'granted',0,false)", [diagnostic, partnerA]), /unique constraint/);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from lead_purchases")).rows[0].n, 1);
  } finally { await db.close(); }
});

test("acquisition eligibility checks preserve active membership, matching, request type and dossier state", async () => {
  const { db } = await database();
  try {
    await assert.rejects(acquire(db, { actor: userB }), /PARTNER_REQUIRED/);
    await assert.rejects(acquire(db, { id: absent }), /LEAD_NOT_FOUND/);
    await db.query("update partners set active=false where id=$1", [partnerA]);
    await assert.rejects(acquire(db), /PARTNER_REQUIRED/);
    await db.query("update partners set active=true where id=$1", [partnerA]);
    await db.query("update partner_users set active=false where partner_id=$1", [partnerA]);
    await assert.rejects(acquire(db), /PARTNER_REQUIRED/);
    await db.query("update partner_users set active=true where partner_id=$1", [partnerA]);
    for (const change of ["archived_at=now()", "status='en analyse'", "request_type='WATER_ANALYSIS'", "matched_partner_ids='{}'"]) {
      await db.exec(`update diagnostics set ${change} where id='${diagnostic}'`);
      await assert.rejects(acquire(db), /LEAD_UNAVAILABLE/);
      await db.query("update diagnostics set archived_at=null,status='AVAILABLE',request_type='TECHNICAL_REQUEST',matched_partner_ids=$2 where id=$1", [diagnostic, [partnerA, partnerB]]);
    }
    await db.query("update diagnostics set lead_locked_until=now()+interval '1 hour' where id=$1", [diagnostic]);
    await assert.rejects(acquire(db), /LEAD_RESERVED/);
    await db.query("update diagnostics set lead_locked_until=now()-interval '1 hour' where id=$1", [diagnostic]);
    assert.equal((await acquire(db)).kind, "checkout");
  } finally { await db.close(); }
});

test("billing changes are read at reservation time and free assignment rolls back if its audit fails", async () => {
  const { db } = await database();
  try {
    for (const invalid of [{ price: null }, { amount: null }, { amount: 0 }, { currency: "EUR" }, { currency: null }]) {
      await assert.rejects(acquire(db, invalid), /BILLING_TERMS_CHANGED/);
    }
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from lead_purchases")).rows[0].n, 0);
    await setting(db, false);
    await db.exec(`create function fail_assignment_audit() returns trigger language plpgsql as $$ begin raise exception 'ASSIGNMENT_AUDIT_FAILED'; end; $$;
      create trigger fail_assignment_audit before insert on diagnostic_activity for each row execute function fail_assignment_audit();`);
    await assert.rejects(acquire(db, { price: null, amount: null }), /ASSIGNMENT_AUDIT_FAILED/);
    assert.equal((await dossier(db)).assigned_partner_id, null);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from lead_purchases")).rows[0].n, 0);
    await db.exec("drop trigger fail_assignment_audit on diagnostic_activity");
    await setting(db, true);
    await assert.rejects(acquire(db, { price: null, amount: null }), /BILLING_TERMS_CHANGED/);
    assert.equal((await acquire(db)).kind, "checkout");
  } finally { await db.close(); }
});

test("new RPCs use invoker privileges and neither public clients nor anonymous callers can mutate billing", async () => {
  const { db } = await database();
  try {
    const names = ["set_partner_leads_paid", "prepare_partner_acquisition", "attach_partner_checkout", "finish_partner_checkout", "apply_partner_payment"];
    const fns = (await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>("select proname,prosecdef,proconfig from pg_proc where proname=any($1)", [names])).rows;
    assert.equal(fns.length, names.length); assert(fns.every(fn => !fn.prosecdef && fn.proconfig.includes('search_path=""')));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(setting(db, false), /permission denied/);
      await assert.rejects(acquire(db), /permission denied/);
      await assert.rejects(db.query("select attach_partner_checkout($1,$2,$3,'cs_forbidden')", [absent, partnerA, diagnostic]), /permission denied/);
      await assert.rejects(db.query("select finish_partner_checkout($1,$2,$3,'cs_forbidden','expired')", [absent, partnerA, diagnostic]), /permission denied/);
      await assert.rejects(db.query("select apply_partner_payment('cs_forbidden',$1,$2,$3,'pi',now())", [absent, partnerA, diagnostic]), /permission denied/);
      await assert.rejects(db.query("select * from partner_lead_terms_history"), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await setting(db, false);
    assert.equal((await acquire(db, { price: null, amount: null })).kind, "assigned");
  } finally { await db.close(); }
});
