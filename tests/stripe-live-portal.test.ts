import { test } from "node:test";
import assert from "node:assert/strict";
import { createSanispaPortal } from "../lib/stripe-portal";
test("production portal sessions explicitly select SANISPA's configuration and preserve the owned customer", async () => {
  const env = process.env.VERCEL_ENV; process.env.VERCEL_ENV = "production";
  let sent: any;
  const configuration: any = { id: "bpc_sanispa", metadata: { application: "sanispa-support", policy: "monthly-20261118" }, features: { invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "at_period_end" }, subscription_update: { enabled: false } } };
  const stripe: any = { billingPortal: { configurations: { list: async () => ({ data: [{ ...configuration, id: "bpc_other", metadata: {} }, configuration] }) }, sessions: { create: async (body: any) => { sent = body; return { url: "https://billing.stripe.com/fixture" }; } } } };
  try {
    await createSanispaPortal(stripe, "cus_owned", "https://support.sani-spa.fr/premium");
    assert.deepEqual(sent, { customer: "cus_owned", return_url: "https://support.sani-spa.fr/premium", locale: "fr", configuration: "bpc_sanispa" });
    configuration.features.subscription_cancel.mode = "immediately";
    await assert.rejects(createSanispaPortal(stripe, "cus_owned", "https://support.sani-spa.fr/premium"), /MISMATCH/);
  } finally { if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env; }
});
test("production refuses an absent dedicated portal instead of borrowing another business configuration", async () => {
  const env = process.env.VERCEL_ENV; process.env.VERCEL_ENV = "production"; let created = false;
  const stripe: any = { billingPortal: { configurations: { list: async () => ({ data: [] }) }, sessions: { create: async () => { created = true; } } } };
  try { await assert.rejects(createSanispaPortal(stripe, "cus_owned", "https://support.sani-spa.fr/premium"), /indisponible/); assert.equal(created, false); }
  finally { if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env; }
});
