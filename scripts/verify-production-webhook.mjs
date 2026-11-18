import Stripe from "stripe";

// Explicit, one-time release probe. It changes no payment, customer or invoice.
if (process.env.VERCEL_ENV === "production" && process.env.SANISPA_VERIFY_LIVE_WEBHOOK === "2026-11-18") {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia", timeout: 15000, maxNetworkRetries: 1 });
  const endpointId = "we_1TfJyuCt1cluNZsK1GBmTOyt", rateId = "txr_1UcyEfCt1cluNZsKfOqT3G84";
  const probeType = "tax_rate.updated", marker = "sanispa-support-20261118";
  let restoreEvents;
  try {
    const account = await stripe.accounts.retrieve();
    if (account.id !== "acct_19HB3qCt1cluNZsK") throw new Error("STRIPE_PROBE_ACCOUNT_MISMATCH");
    const endpoint = await stripe.webhookEndpoints.retrieve(endpointId);
    if (endpoint.url !== "https://support.sani-spa.fr/api/stripe-webhook" || endpoint.status !== "enabled") throw new Error("STRIPE_PROBE_ENDPOINT_MISMATCH");
    restoreEvents = endpoint.enabled_events.filter(type => type !== probeType);
    await stripe.webhookEndpoints.update(endpointId, { enabled_events: [...restoreEvents, probeType] });
    await stripe.taxRates.update(rateId, { metadata: { sanispa_webhook_probe: marker } }, { idempotencyKey: "sanispa-live-delivery-probe-20261118" });
    let delivered = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const events = await stripe.events.list({ type: probeType, limit: 20, created: { gte: Math.floor(Date.now() / 1000) - 3600 } });
      const event = events.data.find(e => e.data.object.id === rateId && e.data.object.metadata?.sanispa_webhook_probe === marker);
      if (event && event.pending_webhooks === 0) {
        console.log("SANISPA livraison Stripe LIVE confirmée :", JSON.stringify({ event: event.id, type: probeType, pending_webhooks: 0, financial_transaction: false }));
        delivered = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!delivered) throw new Error("STRIPE_PROBE_DELIVERY_UNCONFIRMED");
  } catch (error) {
    console.error("SANISPA test livraison LIVE refusé :", JSON.stringify({ type: error.type || error.name, code: error.code || (error.message?.startsWith("STRIPE_PROBE_") ? error.message : undefined), status: error.statusCode }));
    process.exitCode = 1;
  } finally {
    if (restoreEvents) {
      await stripe.webhookEndpoints.update(endpointId, { enabled_events: restoreEvents });
      console.log("SANISPA : sélection initiale des événements Stripe rétablie.");
    }
  }
}
