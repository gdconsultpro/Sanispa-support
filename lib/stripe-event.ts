import type Stripe from "stripe";

/** Existing LIVE endpoints can send an older invoice schema than our TEST one. */
export async function normalizeStripeEvent(event: Stripe.Event, stripe: Stripe) {
  if (event.type !== "invoice.paid") return event;
  const invoice = await stripe.invoices.retrieve(event.data.object.id);
  return { ...event, data: { ...event.data, object: invoice } } as Stripe.Event;
}
