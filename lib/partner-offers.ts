import { acquirePartnerLead } from "./partner-acquisition";
import { getStripe } from "./stripe";
import { HttpError } from "./http";
import {
  activeSubscription,
  leadCatalog,
  type LeadCategory,
} from "./partner-catalog";
import {
  billingFromPurchase,
  partnerAcquisitionError,
  purchaseTermsColumns,
} from "./partner-billing";
import type { AuthenticatedPartner } from "./partner-auth";

export async function loadOfferBilling(
  supabase: any,
  partner: AuthenticatedPartner,
  ids: string[],
) {
  const [
    { data: subscription, error: subError },
    { data: offers, error: offerError },
    { data: purchases, error: purchaseError },
  ] = await Promise.all([
    supabase
      .from("partner_subscriptions")
      .select("plan,status,paid_until")
      .eq("partner_id", partner.id)
      .maybeSingle(),
    ids.length
      ? supabase
          .from("diagnostics")
          .select("id,offer_version,lead_category,lead_amount")
          .in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase
          .from("lead_purchases")
          .select(purchaseTermsColumns)
          .in("request_id", ids)
          .eq("status", "pending")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (subError || offerError || purchaseError)
    throw subError || offerError || purchaseError;
  return new Map<string, any>(
    (offers || []).map((offer: any) => {
      const pending = (purchases || []).filter(
        (p: any) => p.request_id === offer.id,
      );
      const own = pending.find((p: any) => p.partner_id === partner.id),
        elsewhere = pending.some((p: any) => p.partner_id !== partner.id);
      const active = activeSubscription(subscription),
        included = active && subscription.plan === "complete";
      const valid =
        offer.offer_version === 2 &&
        leadCatalog[offer.lead_category as LeadCategory]?.amount ===
          offer.lead_amount;
      return [
        offer.id,
        {
          ownReservation: Boolean(own),
          reservedElsewhere: elsewhere,
          billing: own
            ? billingFromPurchase(own)
            : {
                paymentRequired: !included,
                amount: valid ? (included ? 0 : offer.lead_amount) : null,
                currency: "eur",
                reserved: false,
                available: active && valid,
              },
        },
      ];
    }),
  );
}
export async function acquireOffer({
  supabase,
  partner,
  userId,
  diagnosticId,
  origin,
}: {
  supabase: any;
  partner: AuthenticatedPartner;
  userId: string;
  diagnosticId: string;
  origin: string;
}) {
  const { data: existing, error: existingError } = await supabase
    .from("diagnostics")
    .select("offer_version,assigned_partner_id")
    .eq("id", diagnosticId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.offer_version === 1) {
    const { data: pending, error: pendingError } = await supabase
      .from("lead_purchases")
      .select("id")
      .eq("request_id", diagnosticId)
      .eq("partner_id", partner.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (pending || existing.assigned_partner_id === partner.id)
      return acquirePartnerLead({
        supabase,
        partner,
        userId,
        diagnosticId,
        origin,
      });
    throw new HttpError(
      403,
      "SANISPA doit revalider cette ancienne offre avant toute nouvelle acquisition.",
    );
  }
  const { data, error } = await supabase.rpc("acquire_partner_offer", {
    p_diagnostic: diagnosticId,
    p_partner: partner.id,
    p_actor: userId,
  });
  if (error) {
    if (error.message === "SUBSCRIPTION_REQUIRED")
      throw new HttpError(
        402,
        "Un abonnement mensuel actif est nécessaire. Consultez Mon abonnement.",
      );
    partnerAcquisitionError(error);
  }
  if (data?.kind === "assigned") return { acquired: true };
  const purchase = data?.purchase;
  if (
    !purchase?.id ||
    purchase.partner_id !== partner.id ||
    purchase.request_id !== diagnosticId ||
    !purchase.payment_required
  )
    throw new HttpError(409, "Réservation non confirmée.");
  const stripe = getStripe();
  if (purchase.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(
      purchase.stripe_checkout_session_id,
    );
    if (session.status === "open" && session.url) return { url: session.url };
    if (session.status === "expired") {
      const result = await supabase.rpc("finish_partner_checkout", {
        p_purchase: purchase.id,
        p_partner: partner.id,
        p_diagnostic: diagnosticId,
        p_session: session.id,
        p_status: "expired",
      });
      if (result.error) throw result.error;
    }
    throw new HttpError(
      409,
      "Paiement confirmé ou expiré : actualisez le dossier avant de poursuivre.",
    );
  }
  if (Date.parse(purchase.locked_until) <= Date.now())
    throw new HttpError(
      409,
      "Cette réservation nécessite une vérification SANISPA. Aucun nouveau paiement n’a été créé.",
    );
  const category = String(purchase.stripe_price_id).replace(
    "catalog:v2:",
    "",
  ) as LeadCategory;
  const item = leadCatalog[category];
  if (!item || item.amount !== purchase.amount || purchase.currency !== "eur")
    throw new HttpError(409, "Tarif non confirmé.");
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: purchase.amount,
            tax_behavior: "inclusive",
            product_data: { name: `Contact SANISPA — ${item.label}` },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/partenaire/leads/${diagnosticId}?unlock=success`,
      cancel_url: `${origin}/partenaire/leads/${diagnosticId}?unlock=cancel`,
      metadata: {
        type: "partner_lead_unlock",
        diagnostic_id: diagnosticId,
        partner_id: partner.id,
        lead_purchase_id: purchase.id,
      },
    },
    { idempotencyKey: `partner-lead-${purchase.id}` },
  );
  const result = await supabase.rpc("attach_partner_checkout", {
    p_purchase: purchase.id,
    p_partner: partner.id,
    p_diagnostic: diagnosticId,
    p_session: session.id,
  });
  if (result.error) throw result.error;
  if (!session.url) throw new HttpError(503, "Paiement indisponible.");
  return { url: session.url };
}
