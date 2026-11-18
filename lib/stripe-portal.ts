import type Stripe from "stripe";
import { HttpError } from "./http";

export async function createSanispaPortal(stripe: Stripe, customer: string, returnUrl: string) {
  const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const configuration = configurations.data.find(c => c.metadata?.application === "sanispa-support" && c.metadata?.policy === "monthly-20261118");
  if (process.env.VERCEL_ENV === "production" && !configuration)
    throw new HttpError(503, "La gestion de l’abonnement est momentanément indisponible. Contactez SANISPA.");
  if (configuration && (!configuration.features.invoice_history.enabled || !configuration.features.payment_method_update.enabled ||
      !configuration.features.subscription_cancel.enabled || configuration.features.subscription_cancel.mode !== "at_period_end" ||
      configuration.features.subscription_update.enabled)) throw new Error("SANISPA_PORTAL_CONFIGURATION_MISMATCH");
  return stripe.billingPortal.sessions.create({ customer, return_url: returnUrl, locale: "fr", ...(configuration ? { configuration: configuration.id } : {}) });
}
