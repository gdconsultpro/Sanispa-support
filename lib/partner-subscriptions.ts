import type Stripe from "stripe";
import { getStripe } from "./stripe";
import { HttpError } from "./http";
import { subscriptionPlans, type SubscriptionPlan } from "./partner-catalog";
const idOf = (value: any): string =>
  typeof value === "string" ? value : value?.id || "";
export async function subscriptionCheckout(
  supabase: any,
  partnerId: string,
  userId: string,
  plan: SubscriptionPlan,
  origin: string,
) {
  const { data: attempt, error } = await supabase.rpc(
    "prepare_partner_subscription",
    { p_partner: partnerId, p_actor: userId, p_plan: plan },
  );
  if (error)
    throw new HttpError(
      409,
      "Un abonnement ou un paiement existe déjà. Consultez son état avant de réessayer.",
    );
  const stripe = getStripe();
  if (attempt.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(
      attempt.stripe_session_id,
    );
    if (session.status === "open" && session.url) return { url: session.url };
    if (session.status === "expired") {
      const finished = await supabase
        .from("partner_subscription_checkouts")
        .update({ state: "expired" })
        .eq("id", attempt.id)
        .eq("state", "pending")
        .eq("stripe_session_id", session.id);
      if (finished.error) throw finished.error;
    }
    throw new HttpError(
      409,
      "Paiement terminé ou expiré. Actualisez l’abonnement avant de poursuivre.",
    );
  }
  if (Date.now() - Date.parse(attempt.created_at) > 23 * 3600000)
    throw new HttpError(
      409,
      "Paiement incertain à vérifier par SANISPA. Aucun nouveau prélèvement créé.",
    );
  const item = subscriptionPlans[plan];
  const { data: old, error: oldError } = await supabase
    .from("partner_subscriptions")
    .select("stripe_customer_id")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (oldError) throw oldError;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      payment_method_types: ["card"],
      ...(old ? { customer: old.stripe_customer_id } : {}),
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: item.amount,
            tax_behavior: "inclusive",
            recurring: { interval: "month" },
            product_data: { name: `SANISPA — ${item.label}` },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "partner_subscription",
        checkout_id: attempt.id,
        partner_id: partnerId,
        plan,
      },
      subscription_data: {
        metadata: {
          type: "partner_subscription",
          checkout_id: attempt.id,
          partner_id: partnerId,
          plan,
        },
      },
      success_url: `${origin}/partenaire/abonnement?payment=success`,
      cancel_url: `${origin}/partenaire/abonnement?payment=cancel`,
    },
    { idempotencyKey: `partner-subscription-${attempt.id}` },
  );
  const attached = await supabase
    .from("partner_subscription_checkouts")
    .update({ stripe_session_id: session.id })
    .eq("id", attempt.id)
    .eq("partner_id", partnerId)
    .eq("state", "pending")
    .is("stripe_session_id", null)
    .select("id");
  if (attached.error || !attached.data?.length)
    throw new HttpError(
      503,
      "Confirmation du paiement en attente. Réessayez pour reprendre la même opération.",
    );
  if (!session.url) throw new HttpError(503, "Paiement indisponible.");
  return { url: session.url };
}
export async function processSubscriptionEvent(
  event: Stripe.Event,
  supabase: any,
  stripe = getStripe(),
) {
  // A refund or dispute suspends new acquisitions until SANISPA reconciles the account.
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created"
  ) {
    const charge =
      event.type === "charge.refunded"
        ? (event.data.object as Stripe.Charge)
        : await stripe.charges.retrieve(
            idOf((event.data.object as Stripe.Dispute).charge),
          );
    const invoiceId = idOf(charge.invoice);
    if (invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      const subscriptionId = idOf(invoice.subscription);
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        if (sub.metadata.type === "partner_subscription") {
          const result = await supabase
            .from("partner_subscriptions")
            .update({ status: "review", event_created: event.created })
            .eq("stripe_subscription_id", sub.id);
          if (result.error) throw result.error;
        }
      }
    }
  }
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = idOf(invoice.subscription);
    if (!subscriptionId) return;
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (sub.metadata.type !== "partner_subscription") return;
    const plan = sub.metadata.plan as SubscriptionPlan,
      item = subscriptionPlans[plan];
    if (!item || sub.status !== "active") return;
    if (
      invoice.status !== "paid" ||
      invoice.currency !== "eur" ||
      invoice.total !== item.amount ||
      invoice.amount_paid !== item.amount ||
      sub.items.data.length !== 1 ||
      sub.items.data[0].price.unit_amount !== item.amount ||
      sub.items.data[0].price.recurring?.interval !== "month"
    )
      throw new Error("SUBSCRIPTION_AMOUNT_MISMATCH");
    const { data: checkout, error } = await supabase
      .from("partner_subscription_checkouts")
      .select("stripe_session_id")
      .eq("id", sub.metadata.checkout_id)
      .eq("partner_id", sub.metadata.partner_id)
      .eq("plan", plan)
      .single();
    if (error || !checkout?.stripe_session_id)
      throw new Error("CHECKOUT_NOT_ATTACHED");
    const session = await stripe.checkout.sessions.retrieve(
      checkout.stripe_session_id,
    );
    if (
      idOf(session.subscription) !== sub.id ||
      idOf(session.customer) !== idOf(sub.customer)
    )
      throw new Error("SUBSCRIPTION_MISMATCH");
    const until = invoice.lines.data
      .filter((line) => idOf(line.subscription) === sub.id)
      .reduce((max, line) => Math.max(max, line.period.end), 0);
    if (!until) throw new Error("PAID_PERIOD_MISSING");
    const result = await supabase.rpc("record_partner_subscription", {
      p_partner: sub.metadata.partner_id,
      p_plan: plan,
      p_subscription: sub.id,
      p_customer: idOf(sub.customer),
      p_status: "active",
      p_until: new Date(until * 1000).toISOString(),
      p_event: event.created,
    });
    if (result.error) throw result.error;
  }
  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    if (sub.metadata.type !== "partner_subscription" || sub.status === "active")
      return;
    const result = await supabase
      .from("partner_subscriptions")
      .update({
        status: sub.status === "past_due" ? "past_due" : "canceled",
        event_created: event.created,
      })
      .eq("stripe_subscription_id", sub.id)
      .lte("event_created", event.created);
    if (result.error) throw result.error;
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    if (session.metadata?.type !== "partner_subscription") return;
    const result = await supabase
      .from("partner_subscription_checkouts")
      .update({ state: "expired" })
      .eq("id", session.metadata.checkout_id)
      .eq("stripe_session_id", session.id)
      .eq("state", "pending");
    if (result.error) throw result.error;
  }
}
