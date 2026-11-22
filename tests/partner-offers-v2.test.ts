import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { ids } from "./helpers/dispatch-fixture";
import { leadCatalog, subscriptionPlans } from "../lib/partner-catalog";
import { dispatchCommand } from "../lib/admin-partner-dispatch";
import { canViewPartnerOffer } from "../lib/partner-release";
async function fixture() {
  const db = await fullDatabase();
  await db.exec(`insert into auth.users(id)values('${ids.admin}'),('${ids.user}'),('${ids.otherUser}');
 insert into admin_users(user_id)values('${ids.admin}');
 insert into partners(id,company_name,email)values('${ids.a}','Entreprise A','a@example.invalid'),('${ids.b}','Entreprise B','b@example.invalid');
 insert into partner_users(partner_id,user_id,active)values('${ids.a}','${ids.user}',true),('${ids.b}','${ids.otherUser}',true);
 insert into partner_departments(partner_id,department)values('${ids.a}','67'),('${ids.b}','67');
 insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply)values('${ids.customer}','PRIVATE NAME','0612345678','private@example.invalid','PRIVATE STREET - 67000 - Strasbourg','TEST','2020','exterieur','230V');
 insert into diagnostics(id,customer_id,user_id,problem_type,choice,department)values('${ids.d}','${ids.customer}','${ids.user}','fuite','devis','67');
 insert into diagnostic_photos(diagnostic_id,photo_type,storage_path)values('${ids.d}','visible_problem','selected/photo.jpg');`);
  return db;
}
const publish = (db: any, photos = ["selected/photo.jpg"]) =>
  db.query("select publish_partner_offer($1,$2,$3,$4,$5,$6)", [
    ids.d,
    ids.a,
    ids.admin,
    "fuite",
    "Fuite visible au niveau d’un raccord du spa.",
    photos,
  ]);
const acquire = (db: Awaited<ReturnType<typeof fullDatabase>>) =>
  db.query<any>("select acquire_partner_offer($1,$2,$3) as value", [
    ids.d,
    ids.a,
    ids.user,
  ]);
test("every technical offer requires manual release, active paid subscription, and an approved photo from the same dossier", async () => {
  const db = await fixture();
  try {
    assert.equal(
      canViewPartnerOffer(
        {
          choice: "devis",
          request_type: "TECHNICAL_REQUEST",
          matched_partner_ids: [ids.a],
        },
        ids.a,
      ),
      false,
    );
    await assert.rejects(acquire(db), /LEAD_UNAVAILABLE/);
    await assert.rejects(
      publish(db, ["foreign/customer.jpg"]),
      /INVALID_PREVIEW/,
    );
    await publish(db);
    await assert.rejects(acquire(db), /SUBSCRIPTION_REQUIRED/);
    await db.exec(
      `insert into partner_subscriptions values('${ids.a}','complete','active','sub_fixture','cus_fixture',now()+interval '1 month',1);`,
    );
    assert.equal((await acquire(db)).rows[0].value.kind, "assigned");
    assert.equal((await acquire(db)).rows[0].value.kind, "assigned");
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from lead_purchases where status='granted'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from notification_jobs where kind='partner_accepted'",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("select acquire_partner_offer($1,$2,$3)", [
        ids.d,
        ids.b,
        ids.otherUser,
      ]),
      /LEAD_UNAVAILABLE/,
    );
  } finally {
    await db.close();
  }
});
test("management plan freezes the exact TTC lead price and unlocks only after the matching paid session", async () => {
  const db = await fixture();
  try {
    await publish(db);
    assert.equal((await db.query("select id from partner_private_clients")).rows.length, 0);
    await db.exec(
      `insert into partner_subscriptions values('${ids.a}','management','active','sub_fixture','cus_fixture',now()+interval '1 month',1);`,
    );
    const { purchase } = (await acquire(db)).rows[0].value;
    assert.equal(purchase.amount, 2500);
    assert.equal(purchase.payment_required, true);
    assert.equal((await db.query("select id from partner_private_clients")).rows.length, 0);
    assert.equal(
      (await db.query<any>("select assigned_partner_id from diagnostics"))
        .rows[0].assigned_partner_id,
      null,
    );
    await db.query("select attach_partner_checkout($1,$2,$3,$4)", [
      purchase.id,
      ids.a,
      ids.d,
      "cs_fixture",
    ]);
    await assert.rejects(
      db.query("select apply_partner_payment($1,$2,$3,$4,$5,now())", [
        "wrong",
        purchase.id,
        ids.a,
        ids.d,
        "pi_fixture",
      ]),
      /SESSION_MISMATCH/,
    );
    assert.equal((await db.query("select id from partner_private_clients")).rows.length, 0);
    for (let i = 0; i < 2; i++)
      await db.query("select apply_partner_payment($1,$2,$3,$4,$5,now())", [
        "cs_fixture",
        purchase.id,
        ids.a,
        ids.d,
        "pi_fixture",
      ]);
    assert.deepEqual((await db.query("select partner_id, source_diagnostic_id, name, street, postal_code, city from partner_private_clients")).rows, [
      { partner_id: ids.a, source_diagnostic_id: ids.d, name: "PRIVATE NAME", street: "PRIVATE STREET", postal_code: "67000", city: "Strasbourg" },
    ]);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from notification_jobs where kind='partner_accepted'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query<any>("select assigned_partner_id from diagnostics"))
        .rows[0].assigned_partner_id,
      ids.a,
    );
  } finally {
    await db.close();
  }
});
test("expired or canceled subscription cannot acquire new contacts; catalog and SQL agree on all nine TTC prices", async () => {
  const db = await fixture();
  try {
    await publish(db);
    await db.exec(
      `insert into partner_subscriptions values('${ids.a}','complete','active','sub_fixture','cus_fixture',now()-interval '1 day',1);`,
    );
    await assert.rejects(acquire(db), /SUBSCRIPTION_REQUIRED/);
    await db.exec(
      "update partner_subscriptions set status='canceled',paid_until=now()+interval '1 month'",
    );
    await assert.rejects(acquire(db), /SUBSCRIPTION_REQUIRED/);
    for (const [key, item] of Object.entries(leadCatalog))
      assert.equal(
        (await db.query<any>("select catalog_lead_amount($1) as amount", [key]))
          .rows[0].amount,
        item.amount,
      );
    assert.equal(subscriptionPlans.management.amount, 35000);
    assert.equal(subscriptionPlans.complete.amount, 70000);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select acquire_partner_offer($1,$2,$3)", [
        ids.d,
        ids.a,
        ids.user,
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("preview text rejects obvious contact details; an actual intervention is an explicit administrative event", async () => {
  assert.equal(
    dispatchCommand.safeParse({
      action: "release",
      partnerId: ids.a,
      category: "fuite",
      description: "Appelez le 06 12 34 56 78 pour obtenir les détails.",
      photos: [],
    }).success,
    false,
  );
  const db = await fixture();
  try {
    await assert.rejects(
      db.query("select record_intervention($1,$2,$3,now())", [
        ids.d,
        ids.user,
        ids.a,
      ]),
      /ADMIN_REQUIRED/,
    );
    await db.query("select record_intervention($1,$2,$3,now())", [
      ids.d,
      ids.admin,
      ids.a,
    ]);
    assert.equal(
      (await db.query<any>("select intervened_company_name from diagnostics"))
        .rows[0].intervened_company_name,
      "Entreprise A",
    );
  } finally {
    await db.close();
  }
});


test("declining an exact proposal returns it to manual dispatch and queues only one notification", async () => {
  const db = await fixture();
  try {
    await db.exec("update private.commercial_configuration set payments_paused=true");
    await publish(db);
    const { offered_at } = (await db.query<{ offered_at: string }>("select partner_released_at::text as offered_at from diagnostics")).rows[0];
    const decline = "select decline_partner_offer($1,$2,$3,$4) as job";
    await assert.rejects(db.query(decline, [ids.d, ids.b, ids.otherUser, offered_at]), /OFFER_UNAVAILABLE/);
    await db.exec("set role service_role");
    const params = [ids.d, ids.a, ids.user, offered_at];
    const first = await db.query(decline, params);
    assert.deepEqual((await db.query(decline, params)).rows, first.rows);
    const dossier = (await db.query<{ matched_partner_ids: string[]; assigned_partner_id: string | null; partner_released_at: string | null }>(
      "select matched_partner_ids, assigned_partner_id, partner_released_at from diagnostics",
    )).rows[0];
    assert.deepEqual(dossier, { matched_partner_ids: [], assigned_partner_id: null, partner_released_at: null });
    assert.equal((await db.query("select * from lead_purchases")).rows.length, 0);
    const jobs = (await db.query("select kind,state from notification_jobs order by kind")).rows;
    assert.deepEqual(jobs, [{ kind: "partner", state: "cancelled" }, { kind: "partner_declined", state: "cancelled" }]);
    await db.exec("reset role");
    await publish(db);
    await db.query(decline, params);
    assert.equal((await db.query("select * from diagnostics where partner_released_at is not null")).rows.length, 1);
  } finally {
    await db.close();
  }
});


test("an analysed request stays private until manually proposed, then supports refusal and acceptance", async () => {
  const db = await fixture();
  try {
    await db.exec("update private.commercial_configuration set payments_paused=true; update diagnostics set status='en analyse'");
    await assert.rejects(acquire(db), /LEAD_UNAVAILABLE/);
    const dispatch = "select publish_partner_offer($1,$2,$3,'fuite','Fuite visible au niveau du raccord du spa.','{}')";
    await assert.rejects(db.query(dispatch, [ids.d, ids.a, ids.user]), /ADMIN_REQUIRED/);
    await db.query(dispatch, [ids.d, ids.a, ids.admin]);
    const row = (await db.query<{ status: string; assigned_partner_id: string | null; offered_at: string }>(
      "select status, assigned_partner_id, partner_released_at::text as offered_at from diagnostics",
    )).rows[0];
    assert.equal(row.status, "en analyse");
    assert.equal(row.assigned_partner_id, null);
    await assert.rejects(acquire(db), /CHARTER_REQUIRED/);
    await db.query("select decline_partner_offer($1,$2,$3,$4)", [ids.d, ids.a, ids.user, row.offered_at]);
    await assert.rejects(acquire(db), /LEAD_UNAVAILABLE/);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from notification_jobs where kind='partner' and state='pending'")).rows[0].n, 0);
    await db.query(dispatch, [ids.d, ids.b, ids.admin]);
    await assert.rejects(acquire(db), /LEAD_UNAVAILABLE/);
    await db.query("select accept_partner_charter($1,$2,'essai-gratuit-2026-11-18')", [ids.b, ids.otherUser]);
    const accepted = await db.query<{ value: { kind: string } }>("select acquire_partner_offer($1,$2,$3) as value", [ids.d, ids.b, ids.otherUser]);
    assert.equal(accepted.rows[0].value.kind, "assigned");
    assert.equal((await db.query<{ assigned_partner_id: string }>("select assigned_partner_id from diagnostics")).rows[0].assigned_partner_id, ids.b);
  } finally {
    await db.close();
  }
});
