import { test } from "node:test";
process.env.NEXT_PUBLIC_SANISPA_BILLING_MODE = "live";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { premiumActive, premiumCheckout, processCustomerSubscriptionEvent, premiumTaxPolicy } from "../lib/customer-premium";
import { detectsSolicitation } from "../lib/premium-forum";
import { readingContext, premiumAiInstructions } from "../lib/premium-ai";
import { clientConfirmationUrl } from "../lib/client-access";
const u = "30000000-0000-4000-8000-000000000001", other = "30000000-0000-4000-8000-000000000002", partnerUser = "30000000-0000-4000-8000-000000000003", spa = "30000000-0000-4000-8000-000000000010", foreignSpa = "30000000-0000-4000-8000-000000000011", p = "30000000-0000-4000-8000-000000000020";
async function fixture() {
  const db = await fullDatabase();
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${u}','premium@example.invalid',now()),('${other}','other@example.invalid',now()),('${partnerUser}','partner@example.invalid',now());
    insert into customer_spas(id,user_id,brand) values('${spa}','${u}','TEST'),('${foreignSpa}','${other}','TEST AUTRE');
    insert into partners(id,company_name,email) values('${p}','TEST PARTNER','partner@example.invalid');
    insert into partner_users(partner_id,user_id,role) values('${p}','${partnerUser}','owner');`);
  return db;
}
async function enable(db: any, user = u) {
  await db.query("insert into customer_subscriptions values($1,'active',$2,$3,now()+interval '1 month',100)", [user, `sub_${user}`, `cus_${user}`]);
}
test("Premium billing stores 999 cents server-side, prevents duplicate checkout, and preserves cancellation until the paid period but stops review/expiry", async () => {
  const db = await fixture();
  try {
    const first = (await db.query<any>("select prepare_customer_subscription($1) c", [u])).rows[0].c;
    assert.equal(first.amount, 999);
    assert.equal((await db.query<any>("select prepare_customer_subscription($1) c", [u])).rows[0].c.id, first.id);
    await assert.rejects(db.query("select record_customer_subscription($1,$2,'sub_TEST','cus_TEST',now()+interval '1 month',1)", [first.id, u]), /CHECKOUT_NOT_FOUND/);
    await db.query("update customer_subscription_checkouts set stripe_session_id='cs_TEST' where id=$1", [first.id]);
    await assert.rejects(db.query("select record_customer_subscription($1,$2,'sub_TEST','cus_TEST',now()+interval '1 month',1)", [first.id, other]), /CHECKOUT_NOT_FOUND/);
    await db.query("select record_customer_subscription($1,$2,'sub_TEST','cus_TEST',now()+interval '1 month',100)", [first.id, u]);
    assert.equal((await db.query<any>("select customer_has_premium($1) b", [u])).rows[0].b, true);
    await db.query("update customer_subscriptions set status='canceled' where user_id=$1", [u]);
    assert.equal((await db.query<any>("select customer_has_premium($1) b", [u])).rows[0].b, true);
    await assert.rejects(db.query("select prepare_customer_subscription($1)", [u]), /SUBSCRIPTION_EXISTS/);
    await db.query("update customer_subscriptions set status='review',event_created=200 where user_id=$1", [u]);
    await db.query("select record_customer_subscription($1,$2,'sub_TEST','cus_TEST',now()+interval '1 month',201)", [first.id, u]);
    assert.equal((await db.query<any>("select customer_has_premium($1) b", [u])).rows[0].b, false);
    assert.equal(premiumActive({ status: "canceled", paid_until: new Date(Date.now()+10000).toISOString() }), true);
    assert.equal(premiumActive({ status: "review", paid_until: new Date(Date.now()+10000).toISOString() }), false);
  } finally { await db.close(); }
});
test("care and water tables reject free access and another client's spa; reminder completion is versioned and queues once", async () => {
  const db = await fixture();
  try {
    const entry = "insert into care_journal(user_id,spa_id,kind,performed_at,note) values($1,$2,'filtre',now(),'Nettoyage du filtre')";
    await assert.rejects(db.query(entry, [u, spa]), /PREMIUM_REQUIRED/);
    await enable(db);
    await assert.rejects(db.query(entry, [u, foreignSpa]), /SPA_OWNER_REQUIRED/);
    await db.query(entry, [u, spa]);
    await db.query("insert into water_readings(user_id,spa_id,measured_at,ph,disinfectant) values($1,$2,now(),7.4,'inconnu')", [u, spa]);
    const water = (await db.query<any>("select ph,tac,volume_litres from water_readings")).rows[0];
    assert.equal(Number(water.ph), 7.4); assert.equal(water.tac, null); assert.equal(water.volume_litres, null);
    const reminder = (await db.query<any>("insert into care_reminders(user_id,spa_id,kind,title,due_at,repeat_days) values($1,$2,'filtre','Contrôler mes filtres',now()-interval '1 day',30) returning id", [u, spa])).rows[0];
    assert.equal((await db.query<any>("select queue_premium_care_reminders() n")).rows[0].n, 1);
    assert.equal((await db.query<any>("select queue_premium_care_reminders() n")).rows[0].n, 0);
    await assert.rejects(db.query("select complete_care_reminder($1,$2,1)", [reminder.id, other]), /PREMIUM_REMINDER_REQUIRED/);
    await db.query("select complete_care_reminder($1,$2,1)", [reminder.id, u]);
    await assert.rejects(db.query("select complete_care_reminder($1,$2,1)", [reminder.id, u]), /REMINDER_CONFLICT/);
    assert.equal((await db.query<any>("select count(*)::int n from care_journal")).rows[0].n, 2);
    assert.equal((await db.query<any>("select queue_premium_care_reminders() n")).rows[0].n, 0);
    await db.exec("update customer_subscriptions set paid_until=now()-interval '1 minute'");
    await assert.rejects(db.query(entry, [u, spa]), /PREMIUM_REQUIRED/);
    for (const table of ["care_journal", "care_reminders", "water_readings", "premium_ai_requests", "forum_posts", "spa_manuals"])
      assert.equal((await db.query<any>("select has_table_privilege('authenticated',$1,'SELECT') b", [table])).rows[0].b, false);
  } finally { await db.close(); }
});
test("AI requests verify thread ownership, deduplicate retries including context, and prevent simultaneous calls without a monthly message quota", async () => {
  const db = await fixture();
  const thread = "30000000-0000-4000-8000-000000000030", requestId = "30000000-0000-4000-8000-000000000040", second = "30000000-0000-4000-8000-000000000041";
  const sql = "select begin_premium_ai_request($1,$2,$3,'Mon eau est trouble',':') r";
  try {
    await db.query("insert into premium_ai_threads(id,user_id,topic) values($1,$2,'eau')", [thread, u]);
    await assert.rejects(db.query(sql, [requestId, u, thread]), /PREMIUM_REQUIRED/);
    await enable(db); await enable(db, other);
    await assert.rejects(db.query(sql, [requestId, other, thread]), /THREAD_OWNER_REQUIRED/);
    assert.equal((await db.query<any>(sql, [requestId, u, thread])).rows[0].r.fresh, true);
    assert.equal((await db.query<any>(sql, [requestId, u, thread])).rows[0].r.fresh, false);
    await assert.rejects(db.query("select begin_premium_ai_request($1,$2,$3,'Mon eau est trouble','autre-releve')", [requestId, u, thread]), /AI_REQUEST_CONFLICT/);
    await assert.rejects(db.query(sql, [second, u, thread]), /AI_REQUEST_PENDING/);
    await db.query("update premium_ai_requests set state='complete',answer='Précisez le volume et le produit.',input_tokens=500,output_tokens=100 where id=$1", [requestId]);
    assert.equal((await db.query<any>(sql, [requestId, u, thread])).rows[0].r.answer, "Précisez le volume et le produit.");
    assert.equal((await db.query<any>(sql, [second, u, thread])).rows[0].r.fresh, true);
    await assert.rejects(db.query("select premium_admin_summary($1,now()-interval '1 month')", [u]), /ADMIN_REQUIRED/);
    await db.query("insert into admin_users(user_id,active) values($1,true)", [u]);
    const summary = (await db.query<any>("select premium_admin_summary($1,now()-interval '1 month') s", [u])).rows[0].s;
    assert.equal(summary.requests, 2); assert.equal(summary.unconfirmed_usage, 1); assert.equal(summary.models[0].input_tokens, 500);
  } finally { await db.close(); }
});
test("forum is Premium and excludes partners; posts wait for moderation and replies require an approved topic", async () => {
  const db = await fixture();
  try {
    const insert = "insert into forum_posts(user_id,title,body) values($1,'Entretien du spa','Comment entretenez-vous votre filtre ?') returning id,state";
    await assert.rejects(db.query(insert, [u]), /PREMIUM_REQUIRED/);
    await enable(db); await enable(db, partnerUser);
    await assert.rejects(db.query(insert, [partnerUser]), /PARTNER_FORUM_FORBIDDEN/);
    const post = (await db.query<any>(insert, [u])).rows[0]; assert.equal(post.state, "pending");
    await assert.rejects(db.query("insert into forum_posts(user_id,parent_id,body) values($1,$2,'Je partage mon expérience personnelle.')", [u, post.id]), /FORUM_TOPIC_UNAVAILABLE/);
    await db.query("update forum_posts set state='approved' where id=$1", [post.id]);
    await db.query("insert into forum_posts(user_id,parent_id,body) values($1,$2,'Je partage mon expérience personnelle.')", [u, post.id]);
    assert.equal(detectsSolicitation("Contactez-moi au 06 12 34 56 78 pour un devis gratuit"), true);
    assert.equal(detectsSolicitation("Mon eau reste trouble après nettoyage du filtre."), false);
    assert.equal(new URL(clientConfirmationUrl("https://recette.invalid", "", "premium")).searchParams.get("next"), "premium");
    assert.match(premiumAiInstructions, /N’invente aucun dosage/);
    const context = readingContext({ measured_at: "2026-11-18", volume_litres: null, ph: 7.4, tac: null, temperature: 34, disinfectant: "inconnu", disinfectant_value: null, product: "", note: "Eau trouble" });
    assert.match(context, /"volume_litres":null/);
  } finally { await db.close(); }
});
test("customer Checkout and invoice use 9.99 EUR monthly, inclusive 20 percent VAT, and do not activate on a browser return or forged amount", async () => {
  const previousRate = process.env.STRIPE_PARTNER_TAX_RATE_ID; process.env.STRIPE_PARTNER_TAX_RATE_ID = "txr_TEST";
  try {
    let payload: any, recorded = 0;
    const now = new Date().toISOString();
    const supabase: any = { rpc: async (name: string) => { if (name === "record_customer_subscription") { recorded++; return { error: null }; } return { data: { id: "attempt", amount: 999, created_at: now }, error: null }; }, from: (table: string) => ({ select() { return this; }, eq() { return this; }, update() { return this; }, is() { return this; }, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: { id: "attempt", user_id: u, amount: 999, stripe_session_id: "cs_TEST" }, error: null }), then(resolve: any) { return Promise.resolve({ data: [{ id: "attempt" }], error: null }).then(resolve); } }) };
    const sub = { id: "sub_TEST", customer: "cus_TEST", status: "active", metadata: { type: "customer_premium", checkout_id: "attempt", user_id: u, tax_policy: premiumTaxPolicy, tax_rate_id: "txr_TEST" }, items: { data: [{ price: { unit_amount: 999, recurring: { interval: "month" } } }] } };
    const invoice = { id: "in_TEST", parent: { subscription_details: { subscription: sub.id } }, status: "paid", currency: "eur", total: 999, amount_paid: 999, total_excluding_tax: 833, total_tax_amounts: [{ inclusive: true, tax_rate: "txr_TEST", amount: 166 }], lines: { data: [{ parent: { subscription_item_details: { subscription: sub.id } }, period: { end: 2000000000 } }] } };
    const stripe: any = { taxRates: { retrieve: async () => ({ id: "txr_TEST", active: true, inclusive: true, percentage: 20, country: "FR", tax_type: "vat" }) }, checkout: { sessions: { create: async (p: any) => { payload = p; return { id: "cs_TEST", url: "https://checkout.stripe.com/TEST" }; }, retrieve: async () => ({ customer: "cus_TEST", subscription: sub.id }) } }, subscriptions: { retrieve: async () => sub }, invoices: { retrieve: async () => invoice } };
    await premiumCheckout(supabase, { id: u, email: "test@example.invalid" }, "https://recette.invalid", stripe);
    assert.equal(payload.mode, "subscription"); assert.equal(payload.line_items[0].price_data.unit_amount, 999); assert.equal(payload.line_items[0].price_data.tax_behavior, "inclusive"); assert.deepEqual(payload.subscription_data.default_tax_rates, ["txr_TEST"]); assert.equal(recorded, 0);
    const event: any = { type: "invoice.paid", created: 100, data: { object: invoice } };
    await processCustomerSubscriptionEvent(event, supabase, stripe); assert.equal(recorded, 1);
    invoice.total = 900; await assert.rejects(processCustomerSubscriptionEvent(event, supabase, stripe), /TAX_MISMATCH/); assert.equal(recorded, 1);
  } finally { if (previousRate === undefined) delete process.env.STRIPE_PARTNER_TAX_RATE_ID; else process.env.STRIPE_PARTNER_TAX_RATE_ID = previousRate; }
});
test("server role prepares customer checkout and care notifications while Auth tables remain inaccessible", async () => {
  const db = await fixture();
  try {
    await db.exec("grant usage on schema public,private to service_role;grant select,insert,update,delete on all tables in schema public to service_role;");
    assert.equal((await db.query<any>("select has_table_privilege('service_role','auth.users','SELECT') b")).rows[0].b, false);
    await db.exec("set role service_role");
    const attempt = (await db.query<any>("select prepare_customer_subscription($1) c", [u])).rows[0].c;
    assert.equal(attempt.amount, 999);
    await enable(db);
    await db.query("insert into care_reminders(user_id,spa_id,kind,title,due_at) values($1,$2,'filtre','Vérifier le filtre',now()-interval '1 hour')", [u, spa]);
    assert.equal((await db.query<any>("select queue_premium_care_reminders() n")).rows[0].n, 1);
  } finally { await db.close(); }
});
