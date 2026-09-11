import { getStripe } from "@/lib/stripe";
import { HttpError } from "@/lib/http";
import { getPartnerLeadPrice, partnerAcquisitionError, type LeadPurchaseTerms, type PartnerLeadPrice } from "@/lib/partner-billing";
import type { AuthenticatedPartner } from "@/lib/partner-auth";

type Dependencies = { loadPrice: () => Promise<PartnerLeadPrice>; stripe: typeof getStripe };

/** Only server-verified identities and database terms enter this operation. */
export async function acquirePartnerLead({ supabase, partner, userId, diagnosticId, origin }: {
  supabase: any; partner: AuthenticatedPartner; userId: string; diagnosticId: string; origin: string;
}, dependencies: Dependencies = { loadPrice: getPartnerLeadPrice, stripe: getStripe }): Promise<{ acquired: true } | { url: string }> {
  const prepare = (price: PartnerLeadPrice | null) => supabase.rpc("prepare_partner_acquisition", {
    p_diagnostic: diagnosticId, p_partner: partner.id, p_actor: userId,
    p_price_id: price?.id ?? null, p_amount: price?.amount ?? null, p_currency: price?.currency ?? "eur",
  });
  // The database decides whether new paid terms are needed. Free, owned and pending
  // acquisitions never depend on the current price or a possibly stale partner setting.
  let { data, error } = await prepare(null);
  if (error?.message === "BILLING_TERMS_CHANGED") {
    const price = await dependencies.loadPrice();
    ({ data, error } = await prepare(price));
  }
  if (error) partnerAcquisitionError(error);
  if (data?.kind === "assigned") return { acquired: true };
  const purchase = data?.purchase as LeadPurchaseTerms | undefined;
  if (data?.kind !== "checkout" || !purchase?.id || !purchase.payment_required || purchase.amount <= 0 ||
    purchase.request_id !== diagnosticId || purchase.partner_id !== partner.id)
    throw new HttpError(503, "La prise en charge n’a pas pu être confirmée. Actualisez le dossier avant de réessayer.");

  // Never create a second session for an old uncertain attempt after the provider's
  // idempotency retention window. Keep it reserved for reconciliation instead.
  if (!purchase.stripe_checkout_session_id && (!purchase.locked_until ||
    !Number.isFinite(Date.parse(purchase.locked_until)) || Date.parse(purchase.locked_until) <= Date.now())) {
    throw new HttpError(409, "Cette réservation nécessite une vérification par SANISPA avant de poursuivre. Aucun nouveau paiement n’a été créé.");
  }

  const stripe = dependencies.stripe();
  if (purchase.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(purchase.stripe_checkout_session_id);
    if (session.status === "open" && session.url) return { url: session.url };
    if (session.status === "expired") {
      const { error: releaseError } = await supabase.rpc("finish_partner_checkout", {
        p_purchase: purchase.id, p_partner: partner.id, p_diagnostic: diagnosticId, p_session: session.id, p_status: "expired",
      });
      if (releaseError) partnerAcquisitionError(releaseError);
      throw new HttpError(409, "La réservation de paiement a expiré. Actualisez le dossier pour consulter les conditions de la nouvelle acquisition.");
    }
    throw new HttpError(409, "Le paiement est en cours de confirmation. Actualisez le dossier dans un instant pour vérifier son attribution.");
  }
  if (!purchase.stripe_price_id)
    throw new HttpError(409, "Une réservation ancienne est en cours de préparation. Actualisez le dossier ; si elle reste bloquée, contactez SANISPA.");

  // The attempt id is never recycled. A retry reuses the same Checkout operation and frozen price.
  const session = await stripe.checkout.sessions.create({
    mode: "payment", line_items: [{ price: purchase.stripe_price_id, quantity: 1 }],
    success_url: `${origin}/partenaire/leads/${diagnosticId}?unlock=success`,
    cancel_url: `${origin}/partenaire/leads/${diagnosticId}?unlock=cancel`,
    metadata: { type: "partner_lead_unlock", diagnostic_id: diagnosticId, partner_id: partner.id, lead_purchase_id: purchase.id },
  }, { idempotencyKey: `partner-lead-${purchase.id}` });
  const { error: attachError } = await supabase.rpc("attach_partner_checkout", {
    p_purchase: purchase.id, p_partner: partner.id, p_diagnostic: diagnosticId, p_session: session.id,
  });
  if (attachError) partnerAcquisitionError(attachError);
  if (!session.url) throw new HttpError(503, "La page de paiement est indisponible. Réessayez depuis ce dossier.");
  return { url: session.url };
}
