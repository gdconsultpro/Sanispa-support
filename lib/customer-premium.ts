import { paymentsPaused } from "@/lib/commercial-mode";
import type Stripe from "stripe";
import { requireUser } from "./client-auth";
import { HttpError } from "./http";
import { getStripe } from "./stripe";
import { getPartnerTaxRate, assertPartnerInvoiceTax } from "./partner-tax";
export const premiumPrice = 999;
export const premiumTaxPolicy = "customer-premium-fr-vat20-v1";
export function premiumActive(subscription: { status: string; paid_until: string } | null, now = Date.now()) {
  return Boolean(subscription && ["active", "canceled"].includes(subscription.status) && Date.parse(subscription.paid_until) > now);
}
export async function requirePremium(request: Request) {
  const context = await requireUser(request);
  const { data, error } = await context.supabase.rpc(paymentsPaused() ? "grant_customer_trial_access" : "customer_has_premium", { p_user: context.user.id });
  if (error) throw error;
  if (!data) throw new HttpError(paymentsPaused() ? 503 : 402, paymentsPaused() ? "Votre accès gratuit n’a pas pu être confirmé. Réessayez dans un instant." : "Ce service est inclus dans SANISPA Premium à 9,99 € TTC par mois.");
  return context;
}
export async function premiumCheckout(supabase: any, user: { id: string; email?: string }, origin: string, stripeClient?: Stripe) {
  if (paymentsPaused()) return { url: `${origin}/premium`, complimentary: true };
  const stripe = stripeClient ?? getStripe();
  const prepared = await supabase.rpc("prepare_customer_subscription", { p_user: user.id });
  if (prepared.error) throw new HttpError(409, "Un abonnement ou un paiement existe déjà. Actualisez son état ou ouvrez sa gestion.");
  const attempt = prepared.data;
  if (attempt.amount !== premiumPrice) throw new Error("PREMIUM_TERMS_MISMATCH");
  if (attempt.stripe_session_id) {
    const previous = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id);
    if (previous.status === "open" && previous.url) return { url: previous.url };
    if (previous.status === "expired") {
      const result = await supabase.from("customer_subscription_checkouts").update({ state: "expired" }).eq("id", attempt.id).eq("state", "pending").eq("stripe_session_id", previous.id);
      if (result.error) throw result.error;
    }
    throw new HttpError(409, "Le paiement est terminé ou expiré. Actualisez avant de poursuivre.");
  }
  if (Date.now() - Date.parse(attempt.created_at) > 23 * 3600000) throw new HttpError(409, "Cette tentative de paiement doit être vérifiée par SANISPA.");
  const old = await supabase.from("customer_subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (old.error) throw old.error;
  let taxRate: string;
  try { taxRate = await getPartnerTaxRate(stripe, process.env.STRIPE_CUSTOMER_TAX_RATE_ID || process.env.STRIPE_PARTNER_TAX_RATE_ID); }
  catch { throw new HttpError(503, "Le paiement Premium est momentanément indisponible. Contactez SANISPA."); }
  const metadata = { type: "customer_premium", checkout_id: attempt.id, user_id: user.id, tax_policy: premiumTaxPolicy, tax_rate_id: taxRate };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription", payment_method_types: ["card"],
    ...(old.data ? { customer: old.data.stripe_customer_id } : { customer_email: user.email }),
    line_items: [{ price_data: { currency: "eur", unit_amount: premiumPrice, tax_behavior: "inclusive", recurring: { interval: "month" }, product_data: { name: "SANISPA Premium — abonnement particulier" } }, quantity: 1 }],
    metadata, subscription_data: { default_tax_rates: [taxRate], metadata },
    success_url: `${origin}/premium?payment=success`, cancel_url: `${origin}/premium?payment=cancel`,
  }, { idempotencyKey: `customer-premium:${attempt.id}` });
  const saved = await supabase.from("customer_subscription_checkouts").update({ stripe_session_id: session.id }).eq("id", attempt.id).eq("user_id", user.id).eq("state", "pending").is("stripe_session_id", null).select("id");
  if (saved.error || !saved.data?.length || !session.url) throw new HttpError(503, "Confirmation du paiement en attente. Réessayez pour reprendre la même opération.");
  return { url: session.url };
}
const idOf = (value: any): string => typeof value === "string" ? value : value?.id || "";
function subscriptionId(value: any) {
  return idOf(value.subscription || value.parent?.subscription_details?.subscription || value.parent?.subscription_item_details?.subscription);
}
export async function processCustomerSubscriptionEvent(event: Stripe.Event, supabase: any, stripe = getStripe()) {
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = subscriptionId(invoice); if (!subId) return;
    const sub = await stripe.subscriptions.retrieve(subId);
    if (sub.metadata.type !== "customer_premium") return;
    const attempt = await supabase.from("customer_subscription_checkouts").select("id,user_id,amount,stripe_session_id").eq("id", sub.metadata.checkout_id).eq("user_id", sub.metadata.user_id).single();
    if (attempt.error || attempt.data?.amount !== premiumPrice || !attempt.data.stripe_session_id) throw new Error("PREMIUM_CHECKOUT_MISMATCH");
    const session = await stripe.checkout.sessions.retrieve(attempt.data.stripe_session_id);
    if (idOf(session.subscription) !== sub.id || idOf(session.customer) !== idOf(sub.customer)) throw new Error("PREMIUM_SUBSCRIPTION_MISMATCH");
    if (sub.status !== "active" || sub.metadata.tax_policy !== premiumTaxPolicy || sub.items.data.length !== 1 || sub.items.data[0].price.unit_amount !== premiumPrice || sub.items.data[0].price.recurring?.interval !== "month") throw new Error("PREMIUM_AMOUNT_MISMATCH");
    await assertPartnerInvoiceTax(stripe, invoice.id, premiumPrice, sub.metadata.tax_rate_id || "");
    const until = invoice.lines.data.filter(line => subscriptionId(line) === sub.id).reduce((max, line) => Math.max(max, line.period.end), 0);
    if (!until) throw new Error("PREMIUM_PAID_PERIOD_MISSING");
    const saved = await supabase.rpc("record_customer_subscription", { p_checkout: attempt.data.id, p_user: attempt.data.user_id, p_subscription: sub.id, p_customer: idOf(sub.customer), p_until: new Date(until * 1000).toISOString(), p_event: event.created });
    if (saved.error) throw saved.error;
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    if (sub.metadata.type !== "customer_premium" || sub.status === "active") return;
    const saved = await supabase.from("customer_subscriptions").update({ status: sub.status === "past_due" ? "past_due" : "canceled", event_created: event.created }).eq("stripe_subscription_id", sub.id).neq("status", "review").lte("event_created", event.created);
    if (saved.error) throw saved.error;
  }
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const object = event.data.object as any;
    const charge = await stripe.charges.retrieve(event.type === "charge.refunded" ? object.id : idOf(object.charge));
    if (!charge.invoice) return;
    const invoice = await stripe.invoices.retrieve(idOf(charge.invoice));
    const subId = subscriptionId(invoice); if (!subId) return;
    const sub = await stripe.subscriptions.retrieve(subId); if (sub.metadata.type !== "customer_premium") return;
    const saved = await supabase.from("customer_subscriptions").update({ status: "review", event_created: event.created }).eq("stripe_subscription_id", sub.id);
    if (saved.error) throw saved.error;
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    if (session.metadata?.type !== "customer_premium") return;
    const saved = await supabase.from("customer_subscription_checkouts").update({ state: "expired" }).eq("id", session.metadata.checkout_id).eq("stripe_session_id", session.id).eq("state", "pending");
    if (saved.error) throw saved.error;
  }
}
