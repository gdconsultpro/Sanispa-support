import Stripe from "stripe";

if (process.env.VERCEL_ENV === "production") {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia", timeout: 15000, maxNetworkRetries: 1 });
  try {
    const account = await stripe.accounts.retrieve();
    console.log("SANISPA Stripe LIVE : compte", account.id);
    if (account.id !== "acct_19HB3qCt1cluNZsK") throw new Error("STRIPE_ACCOUNT_MISMATCH");
    let rate = await stripe.taxRates.retrieve(process.env.STRIPE_PARTNER_TAX_RATE_ID);
    // One-time completion of the manual LIVE rate created for this release.
    // The dashboard populated the VAT label but left Stripe's tax_type null.
    // Never create a duplicate rate or change its TTC treatment/percentage.
    if (process.env.SANISPA_COMPLETE_LIVE_VAT === "2026-11-18" &&
        rate.id === "txr_1UcyEfCt1cluNZsKfOqT3G84" && rate.livemode &&
        rate.country === "FR" && rate.percentage === 20 && rate.inclusive && rate.active && rate.tax_type === null) {
      rate = await stripe.taxRates.update(rate.id, { tax_type: "vat" }, { idempotencyKey: "sanispa-complete-live-vat-20261118" });
      console.log("SANISPA : qualification TVA complétée sur le taux LIVE existant.");
    }
    console.log("SANISPA TVA LIVE :", JSON.stringify({ id: rate.id, active: rate.active, inclusive: rate.inclusive, percentage: rate.percentage, country: rate.country, tax_type: rate.tax_type, livemode: rate.livemode }));
    if (!rate.active || !rate.inclusive || rate.percentage !== 20 || rate.country !== "FR" || rate.tax_type !== "vat" || !rate.livemode)
      throw new Error("STRIPE_LIVE_TAX_MISMATCH");
    const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    console.log("SANISPA portails LIVE :", JSON.stringify(configurations.data.map(c => ({ id: c.id, default: c.is_default, invoice_history: c.features.invoice_history.enabled, payment_method_update: c.features.payment_method_update.enabled, cancellation: c.features.subscription_cancel.enabled, cancellation_mode: c.features.subscription_cancel.mode }))));
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpoint = endpoints.data.find(e => e.id === "we_1TfJyuCt1cluNZsK1GBmTOyt");
    if (!endpoint || endpoint.status !== "enabled" || endpoint.url !== "https://support.sani-spa.fr/api/stripe-webhook")
      throw new Error("STRIPE_LIVE_WEBHOOK_MISMATCH");
    const expected = ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "invoice.paid", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded", "charge.dispute.created"];
    if (!expected.every(type => endpoint.enabled_events.includes(type) || endpoint.enabled_events.includes("*"))) throw new Error("STRIPE_LIVE_EVENTS_MISSING");
    console.log("SANISPA webhook LIVE :", JSON.stringify({ id: endpoint.id, status: endpoint.status, url: endpoint.url, api_version: endpoint.api_version, enabled_events: endpoint.enabled_events }));
  } catch (error) {
    // Provider errors can include credential details: never print their message.
    console.error("SANISPA préparation LIVE refusée :", JSON.stringify({ type: error.type || error.name, code: error.code || (error.message?.startsWith("STRIPE_") ? error.message : undefined), status: error.statusCode }));
    process.exit(1);
  }
}
