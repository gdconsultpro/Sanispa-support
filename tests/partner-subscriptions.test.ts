import { test } from "node:test";
import assert from "node:assert/strict";
import { processSubscriptionEvent } from "../lib/partner-subscriptions";
import { fullDatabase } from "./helpers/full-database";
import { ids } from "./helpers/dispatch-fixture";
test("a signed payment event must match the checkout, plan, exact TTC amount and paid invoice period; stale events cannot revert the entitlement", async () => {
  const db = await fullDatabase();
  try {
    await db.exec(
      `insert into partners(id,company_name,email)values('${ids.a}','TEST','test@example.invalid');insert into partner_subscription_checkouts(id,partner_id,plan,stripe_session_id)values('${ids.d}','${ids.a}','management','cs_fixture');`,
    );
    const sub = {
      id: "sub_fixture",
      customer: "cus_fixture",
      status: "active",
      metadata: {
        type: "partner_subscription",
        checkout_id: ids.d,
        partner_id: ids.a,
        plan: "management",
      },
      items: {
        data: [
          { price: { unit_amount: 30000, recurring: { interval: "month" } } },
        ],
      },
    };
    let session = { subscription: "sub_fixture", customer: "cus_fixture" };
    const stripe: any = {
      subscriptions: { retrieve: async () => sub },
      checkout: { sessions: { retrieve: async () => session } },
    };
    const supabase: any = {
      from: () => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          return { data: { stripe_session_id: "cs_fixture" }, error: null };
        },
      }),
      rpc: async (_name: string, p: any) => {
        try {
          await db.query(
            "select record_partner_subscription($1,$2,$3,$4,$5,$6,$7)",
            [
              p.p_partner,
              p.p_plan,
              p.p_subscription,
              p.p_customer,
              p.p_status,
              p.p_until,
              p.p_event,
            ],
          );
          return { error: null };
        } catch (error) {
          return { error };
        }
      },
    };
    const invoice = {
      id: "in_fixture",
      subscription: "sub_fixture",
      status: "paid",
      currency: "eur",
      total: 30000,
      amount_paid: 30000,
      lines: {
        data: [{ subscription: "sub_fixture", period: { end: 2000000000 } }],
      },
    };
    const event: any = {
      type: "invoice.paid",
      created: 100,
      data: { object: invoice },
    };
    await processSubscriptionEvent(event, supabase, stripe);
    let row = (await db.query<any>("select * from partner_subscriptions"))
      .rows[0];
    assert.equal(row.plan, "management");
    assert.equal(row.status, "active");
    assert.equal(Date.parse(row.paid_until), 2000000000000);
    const modernInvoice = {
      ...invoice,
      subscription: undefined,
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_fixture" },
      },
      lines: {
        data: [
          {
            parent: {
              type: "subscription_item_details",
              subscription_item_details: { subscription: "sub_fixture" },
            },
            period: { end: 2000000100 },
          },
        ],
      },
    };
    await processSubscriptionEvent(
      { ...event, created: 101, data: { object: modernInvoice } },
      supabase,
      stripe,
    );
    row = (await db.query<any>("select * from partner_subscriptions")).rows[0];
    assert.equal(
      Date.parse(row.paid_until),
      2000000100000,
      "Basil/Dahlia invoice and line parent references must activate the paid period",
    );
    const taxMetadata = sub.metadata as Record<string, string>;
    taxMetadata.tax_policy = "fr-vat20-inclusive-v1";
    taxMetadata.tax_rate_id = "txr_fixture";
    stripe.invoices = { retrieve: async () => ({ ...invoice, total_excluding_tax: 30000, total_tax_amounts: [] }) };
    await assert.rejects(
      processSubscriptionEvent({ ...event, created: 102 }, supabase, stripe),
      /PARTNER_TAX_MISMATCH/,
    );
    assert.equal(Number((await db.query<any>("select event_created from partner_subscriptions")).rows[0].event_created), 101);
    stripe.invoices = { retrieve: async () => ({ ...invoice, total_excluding_tax: 25000,
      total_tax_amounts: [{ inclusive: true, amount: 5000, tax_rate: "txr_fixture" }] }) };
    await processSubscriptionEvent({ ...event, created: 102 }, supabase, stripe);
    delete taxMetadata.tax_policy;
    delete taxMetadata.tax_rate_id;
    await assert.rejects(
      processSubscriptionEvent(
        { ...event, data: { object: { ...invoice, amount_paid: 29999 } } },
        supabase,
        stripe,
      ),
      /AMOUNT_MISMATCH/,
    );
    session = { subscription: "sub_foreign", customer: "cus_fixture" };
    await assert.rejects(
      processSubscriptionEvent(event, supabase, stripe),
      /SUBSCRIPTION_MISMATCH/,
    );
    await db.query("select record_partner_subscription($1,$2,$3,$4,$5,$6,$7)", [
      ids.a,
      "management",
      "sub_fixture",
      "cus_fixture",
      "canceled",
      "2033-05-18",
      200,
    ]);
    session = { subscription: "sub_fixture", customer: "cus_fixture" };
    await processSubscriptionEvent(event, supabase, stripe);
    row = (await db.query<any>("select * from partner_subscriptions")).rows[0];
    assert.equal(row.status, "canceled");
    assert.equal(Number(row.event_created), 200);
    stripe.invoices = { retrieve: async () => modernInvoice };
    let retrievedCharge = "";
    stripe.charges = { retrieve: async (id: string) => {
      retrievedCharge = id;
      return { id, invoice: "in_fixture" };
    } };
    const refundDatabase: any = {
      from: () => ({
        update: (values: any) => ({
          eq: async () => {
            await db.query(
              "update partner_subscriptions set status=$1,event_created=$2 where stripe_subscription_id='sub_fixture'",
              [values.status, values.event_created],
            );
            return { error: null };
          },
        }),
      }),
    };
    await processSubscriptionEvent(
      {
        type: "charge.refunded",
        created: 201,
        data: { object: { id: "ch_fixture" } },
      } as any,
      refundDatabase,
      stripe,
    );
    assert.equal(retrievedCharge, "ch_fixture");
    await processSubscriptionEvent(
      { ...event, created: 300 },
      supabase,
      stripe,
    );
    row = (await db.query<any>("select * from partner_subscriptions")).rows[0];
    assert.equal(
      row.status,
      "review",
      "a later renewal must not silently clear a refund review",
    );
  } finally {
    await db.close();
  }
});
