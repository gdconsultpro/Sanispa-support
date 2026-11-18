import { test } from "node:test";
import assert from "node:assert/strict";
import { getPartnerTaxRate, assertPartnerInvoiceTax } from "../lib/partner-tax";
import { subscriptionCheckout } from "../lib/partner-subscriptions";
import { acquireOffer } from "../lib/partner-offers";

const rate = { id: "txr_fixture", active: true, inclusive: true, percentage: 20, country: "FR", tax_type: "vat" };
test("missing, inactive, exclusive, foreign and incorrect VAT rates cannot create a new partner payment", async () => {
  await assert.rejects(getPartnerTaxRate({} as any, ""), /TVA/);
  for (const invalid of [{ active: false }, { inclusive: false }, { percentage: 19 }, { country: "DE" }, { tax_type: "sales_tax" }])
    await assert.rejects(getPartnerTaxRate({ taxRates: { retrieve: async () => ({ ...rate, ...invalid }) } } as any, rate.id), /20 %/);
});

test("invoices retain the agreed TTC total and must contain the exact inclusive VAT, including cent rounding", async () => {
  for (const [gross, net, tax] of [[30000, 25000, 5000], [70000, 58333, 11667], [2500, 2083, 417], [5900, 4917, 983], [4900, 4083, 817], [6900, 5750, 1150], [8900, 7417, 1483], [3900, 3250, 650], [2000, 1667, 333]]) {
    const invoice = { status: "paid", currency: "eur", total: gross, amount_paid: gross, total_excluding_tax: net, total_tax_amounts: [{ inclusive: true, tax_rate: rate.id, amount: tax }] };
    const stripe: any = { invoices: { retrieve: async () => invoice } };
    await assertPartnerInvoiceTax(stripe, "in_fixture", gross, rate.id);
    for (const bad of [{ total_tax_amounts: [] }, { total_excluding_tax: gross }, { total_tax_amounts: [{ inclusive: false, tax_rate: rate.id, amount: tax }] }, { total_tax_amounts: [{ inclusive: true, tax_rate: "txr_foreign", amount: tax }] }])
      await assert.rejects(assertPartnerInvoiceTax({ invoices: { retrieve: async () => ({ ...invoice, ...bad }) } } as any, "in_fixture", gross, rate.id), /TAX_MISMATCH/);
  }
});

test("both subscriptions apply inclusive VAT without increasing TTC; paid contacts create an invoice on the same partner billing account", async () => {
  const previous = process.env.STRIPE_PARTNER_TAX_RATE_ID;
  process.env.STRIPE_PARTNER_TAX_RATE_ID = rate.id;
  try {
    const created: any[] = [];
    const stripe: any = { taxRates: { retrieve: async () => rate }, checkout: { sessions: { create: async (payload: any) => { created.push(payload); return { id: "cs_fixture", url: "https://checkout.stripe.com/fixture" }; } } } };
    const db: any = {
      rpc: async (name: string) => ({ error: null, data: name === "prepare_partner_subscription"
        ? { id: "attempt", created_at: new Date().toISOString() }
        : { kind: "payment", purchase: { id: "purchase", partner_id: "partner", request_id: "diagnostic", payment_required: true, locked_until: new Date(Date.now() + 600000).toISOString(), stripe_price_id: "catalog:v2:fuite", amount: 2500, currency: "eur" } } }),
      from: (table: string) => ({
        select() { return this; }, eq() { return this; }, update() { return this; }, is() { return this; },
        maybeSingle: async () => ({ error: null, data: table === "diagnostics" ? { offer_version: 2 } : { stripe_customer_id: "cus_partner" } }),
        single: async () => ({ error: null, data: { stripe_customer_id: "cus_partner" } }),
        then(resolve: any) { return Promise.resolve({ data: [{ id: "attempt" }], error: null }).then(resolve); },
      }),
    };
    for (const plan of ["management", "complete"] as const) await subscriptionCheckout(db, "partner", "user", plan, "https://recipe.invalid", stripe);
    await acquireOffer({ supabase: db, partner: { id: "partner" } as any, userId: "user", diagnosticId: "diagnostic", origin: "https://recipe.invalid", stripeClient: stripe });
    assert.deepEqual(created.map(c => c.line_items[0].price_data.unit_amount), [30000, 70000, 2500]);
    for (const c of created) assert.equal(c.line_items[0].price_data.tax_behavior, "inclusive");
    for (const c of created.slice(0, 2)) {
      assert.deepEqual(c.subscription_data.default_tax_rates, [rate.id]);
      assert.equal(c.subscription_data.metadata.tax_rate_id, rate.id);
    }
    assert.deepEqual(created[2].line_items[0].tax_rates, [rate.id]);
    assert.equal(created[2].invoice_creation.enabled, true);
    assert.equal(created[2].customer, "cus_partner");
    assert.equal(created[2].metadata.tax_rate_id, rate.id);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_PARTNER_TAX_RATE_ID;
    else process.env.STRIPE_PARTNER_TAX_RATE_ID = previous;
  }
});
