import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { premiumCheckout } from "../lib/customer-premium";
import { subscriptionCheckout } from "../lib/partner-subscriptions";
import { acquireOffer } from "../lib/partner-offers";
import { safeMeetingUrl, videoSession, videoManagementSchema } from "../lib/video-assistance";
import { paymentsPaused } from "../lib/commercial-mode";

const uid = (suffix: number) => `70000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const client = uid(1), other = uid(2), operator = uid(3), admin = uid(4), unconfirmed = uid(5), partner = uid(10), customer = uid(20), diagnostic = uid(30), foreignDiagnostic = uid(31);
async function fixture() {
  const db = await fullDatabase();
  await db.exec(`update private.commercial_configuration set payments_paused=true;
    insert into auth.users(id,email,email_confirmed_at) values('${client}','client@example.invalid',now()),('${other}','other@example.invalid',now()),('${operator}','partner@example.invalid',now()),('${admin}','admin@example.invalid',now()),('${unconfirmed}','unconfirmed@example.invalid',null);
    insert into admin_users(user_id) values('${admin}');
    insert into partners(id,company_name,email) values('${partner}','PARTENAIRE TEST','partner@example.invalid');
    insert into partner_users(partner_id,user_id,role) values('${partner}','${operator}','owner');
    insert into partner_departments(partner_id,department) values('${partner}','67');
    insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values('${customer}','CLIENT TEST','0000000000','client@example.invalid','ADRESSE TEST','TEST','2020','exterieur','230V');
    insert into diagnostics(id,customer_id,user_id,problem_type,choice,department) values('${diagnostic}','${customer}','${client}','fuite','intervention','67'),('${foreignDiagnostic}','${customer}','${other}','pompe','intervention','67');`);
  return db;
}

test("complimentary Premium requires a server-owned access grant; no Stripe subscription or paid Checkout is invented", async () => {
  const db = await fixture();
  try {
    await db.exec("set role service_role");
    await db.query("select grant_customer_trial_access($1)", [client]);
    assert.equal((await db.query<any>("select customer_has_premium($1) b", [client])).rows[0].b, true);
    await db.exec("reset role");
    assert.equal((await db.query<any>("select customer_has_premium($1) b", [unconfirmed])).rows[0].b, false);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [other]);
    assert.equal((await db.query<any>("select customer_has_premium($1) b", [other])).rows[0].b, false);
    await assert.rejects(db.query("select prepare_customer_subscription($1)", [client]), /PAYMENTS_PAUSED/);
    await assert.rejects(db.query("select prepare_partner_subscription($1,$2,'management')", [partner, operator]), /PAYMENTS_PAUSED/);
    assert.equal((await db.query<any>("select count(*)::int n from customer_subscription_checkouts")).rows[0].n, 0);
    await db.exec("update private.commercial_configuration set payments_paused=false");
    assert.equal((await db.query<any>("select customer_has_premium($1) b", [client])).rows[0].b, false);
  } finally { await db.close(); }
});

test("free partner acquisition preserves manual release, targeted membership and charter, records a zero-cost grant once and never creates a payment", async () => {
  const db = await fixture();
  try {
    const acquire = (actor = operator) => db.query<any>("select acquire_partner_offer($1,$2,$3) r", [diagnostic, partner, actor]);
    await assert.rejects(acquire(), /LEAD_UNAVAILABLE/);
    await db.query("select publish_partner_offer($1,$2,$3,'fuite','Fuite visible au raccord du spa.',array[]::text[])", [diagnostic, partner, admin]);
    assert.equal((await db.query("select id from partner_private_clients")).rows.length, 0);
    await assert.rejects(acquire(), /CHARTER_REQUIRED/);
    await db.query("select accept_partner_charter($1,$2,'essai-gratuit-2026-11-18')", [partner, operator]);
    await assert.rejects(acquire(other), /PARTNER_REQUIRED/);
    assert.equal((await acquire()).rows[0].r.kind, "assigned");
    await acquire();
    assert.deepEqual((await db.query("select partner_id,source_diagnostic_id from partner_private_clients")).rows, [
      { partner_id: partner, source_diagnostic_id: diagnostic },
    ]);
    const rows = (await db.query<any>("select status,payment_required,amount,stripe_checkout_session_id from lead_purchases")).rows;
    assert.equal(rows.length, 1); assert.deepEqual(rows[0], { status: "granted", payment_required: false, amount: 0, stripe_checkout_session_id: null });
    assert.equal((await db.query<any>("select count(*)::int n from partner_subscriptions")).rows[0].n, 0);
    assert.equal((await db.query<any>("select count(*)::int n from notification_jobs where kind='partner_accepted'")).rows[0].n, 1);
    assert.equal((await db.query<any>("select metadata->>'commercial_mode' mode from diagnostic_activity where event_type='partner_assigned'")).rows[0].mode, "complimentary");
  } finally { await db.close(); }
});

test("visio requests enforce ownership and partner membership, preserve the 59 EUR quote without charging, and deduplicate requests and notifications", async () => {
  const db = await fixture();
  try {
    await db.exec("set role service_role");
    const request = (user: string, diag: string, audience = "customer", company: string | null = null) => db.query<any>("select request_video_assistance($1,$2,$3,$4,'Je souhaite être accompagné sur cette fuite.','Mardi après-midi','client@example.invalid') r", [user, audience, diag, company]);
    await assert.rejects(request(other, diagnostic), /DIAGNOSTIC_OWNER_REQUIRED/);
    await assert.rejects(request(unconfirmed, diagnostic), /DIAGNOSTIC_OWNER_REQUIRED/);
    const first = (await request(client, diagnostic)).rows[0].r;
    assert.equal((await request(client, diagnostic)).rows[0].r.id, first.id);
    assert.equal(first.quoted_amount, 5900); assert.equal(first.collected_amount, 0); assert.equal(first.duration_minutes, 30); assert.equal(first.billing_mode, "complimentary");
    await assert.rejects(db.query("update video_assistance_sessions set collected_amount=5900 where id=$1", [first.id]), /check constraint/);
    await assert.rejects(request(other, diagnostic, "partner", partner), /PARTNER_REQUIRED/);
    await assert.rejects(request(operator, foreignDiagnostic, "partner", partner), /DIAGNOSTIC_OWNER_REQUIRED/);
    const professional = (await db.query<any>("select request_video_assistance($1,'partner',null,$2,'Appui technique pour une réparation.','Jeudi matin','partner@example.invalid') r", [operator, partner])).rows[0].r;
    assert.equal(professional.quoted_amount, null); assert.equal(professional.collected_amount, 0);
    assert.equal((await db.query<any>("select count(*)::int n from notification_jobs where kind='visio_requested'")).rows[0].n, 2);
    const [notice] = (await db.query<{ first_delivery_attempt_at: Date }>(
      "select first_delivery_attempt_at from claim_notifications($1)", [`visio-request:${first.id}`],
    )).rows;
    assert.ok(notice.first_delivery_attempt_at);
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await db.query<any>("select has_table_privilege($1,'video_assistance_sessions','SELECT') b", [role])).rows[0].b, false);
      assert.equal((await db.query<any>("select has_function_privilege($1,'request_video_assistance(uuid,text,uuid,uuid,text,text,text)','EXECUTE') b", [role])).rows[0].b, false);
    }
  } finally { await db.close(); }
});

test("only administrators schedule visios; stale versions, overlapping slots and terminal-state edits are rejected, and canceled links stay hidden", async () => {
  const db = await fixture();
  try {
    await db.exec("set role service_role");
    const a = (await db.query<any>("select request_video_assistance($1,'customer',$2,null,'Aide pour préciser ma fuite.','Mardi','client@example.invalid') r", [client, diagnostic])).rows[0].r;
    const b = (await db.query<any>("select request_video_assistance($1,'partner',null,$2,'Aide technique pour un dépannage.','Jeudi','partner@example.invalid') r", [operator, partner])).rows[0].r;
    const start = new Date(Date.now() + 2 * 86400000).toISOString();
    const schedule = (id: string, actor = admin, version = 1, when = start) => db.query<any>("select manage_video_assistance($1,$2,$3,'schedule',$4,'https://meet.google.com/abc-defg-hij') r", [id, actor, version, when]);
    await assert.rejects(schedule(a.id, client), /ADMIN_REQUIRED/);
    const scheduled = (await schedule(a.id)).rows[0].r;
    assert.equal(scheduled.status, "scheduled"); assert.equal(videoSession(scheduled).meetingUrl, "https://meet.google.com/abc-defg-hij");
    await assert.rejects(schedule(a.id), /VIDEO_CONFLICT/);
    await assert.rejects(schedule(b.id), /VIDEO_SLOT_UNAVAILABLE/);
    await schedule(b.id, admin, 1, new Date(Date.parse(start) + 30 * 60000).toISOString());
    const canceled = (await db.query<any>("select manage_video_assistance($1,$2,2,'cancel') r", [a.id, admin])).rows[0].r;
    assert.equal(videoSession(canceled).meetingUrl, null);
    await assert.rejects(schedule(a.id, admin, 3), /VIDEO_TRANSITION_INVALID/);
    assert.equal((await db.query<any>("select count(*)::int n from notification_jobs where kind='visio_updated'")).rows[0].n, 3);
  } finally { await db.close(); }
});

test("paused Checkout helpers do not call Stripe or create records, and an assigned free offer needs no Stripe customer", async () => {
  const previous = process.env.NEXT_PUBLIC_SANISPA_BILLING_MODE;
  process.env.NEXT_PUBLIC_SANISPA_BILLING_MODE = "paused";
  try {
    const stripe = new Proxy({}, { get() { throw new Error("Stripe must not be called"); } }) as any;
    const supabase = { rpc() { throw new Error("No synthetic subscription is allowed"); } };
    assert.equal(paymentsPaused(), true);
    assert.deepEqual(await premiumCheckout(supabase, { id: client }, "https://app.fixture.invalid", stripe), { url: "https://app.fixture.invalid/premium", complimentary: true });
    assert.deepEqual(await subscriptionCheckout(supabase, partner, operator, "management", "https://app.fixture.invalid", stripe), { url: "https://app.fixture.invalid/partenaire", complimentary: true });
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { offer_version: 2 } }) }) }) }), rpc: async () => ({ data: { kind: "assigned" } }) };
    assert.deepEqual(await acquireOffer({ supabase: db, partner: { id: partner } as any, userId: operator, diagnosticId: diagnostic, origin: "https://app.fixture.invalid", stripeClient: stripe }), { acquired: true });
    for (const invalid of ["http://meet.google.com/a", "https://meet.google.com.evil.invalid/a", "https://user:password@zoom.us/a", "https://127.0.0.1/a", "javascript:alert(1)"]) assert.equal(safeMeetingUrl(invalid), false);
    assert.equal(safeMeetingUrl("https://meet.google.com/abc-defg-hij"), true);
    assert.equal(videoManagementSchema.safeParse({ action: "schedule", id: uid(50), version: 1, startsAt: "2020-01-01T00:00:00Z", meetingUrl: "https://meet.google.com/a" }).success, false);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SANISPA_BILLING_MODE; else process.env.NEXT_PUBLIC_SANISPA_BILLING_MODE = previous; }
});
