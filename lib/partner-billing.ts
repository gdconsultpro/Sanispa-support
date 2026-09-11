import { getStripe } from "@/lib/stripe";
import { HttpError } from "@/lib/http";
import type { AuthenticatedPartner } from "@/lib/partner-auth";

export type PartnerLeadBilling = {
  paymentRequired: boolean;
  amount: number | null;
  currency: string;
  reserved: boolean;
  available: boolean;
};
export type LeadPurchaseTerms = {
  id: string;
  request_id: string;
  partner_id: string;
  status: string;
  payment_required: boolean;
  amount: number;
  currency: string;
  stripe_price_id: string | null;
  stripe_checkout_session_id: string | null;
  locked_until: string | null;
};
export type PartnerLeadPrice = { id: string; amount: number; currency: string };
export const purchaseTermsColumns = "id,request_id,partner_id,status,payment_required,amount,currency,stripe_price_id,stripe_checkout_session_id,locked_until";

export async function getPartnerLeadPrice(): Promise<PartnerLeadPrice> {
  const id = process.env.STRIPE_PRICE_PARTNER_LEAD_UNLOCK;
  if (!id) throw new HttpError(503, "Le tarif de ce dossier est momentanément indisponible. Réessayez plus tard ou contactez SANISPA.");
  const price = await getStripe().prices.retrieve(id);
  if (!price.active || price.type !== "one_time" || !Number.isSafeInteger(price.unit_amount) || !price.unit_amount || price.unit_amount < 0)
    throw new HttpError(503, "Le tarif de ce dossier est momentanément indisponible. Contactez SANISPA.");
  return { id: price.id, amount: price.unit_amount, currency: price.currency };
}

export function billingFromPurchase(purchase: LeadPurchaseTerms): PartnerLeadBilling {
  return { paymentRequired: purchase.payment_required, amount: purchase.amount, currency: purchase.currency,
    reserved: purchase.status === "pending", available: purchase.status !== "pending" || Boolean(purchase.stripe_price_id || purchase.stripe_checkout_session_id) };
}

/** Preview-only terms. The acquisition RPC always makes the authoritative decision. */
export async function loadPartnerLeadBilling(supabase: any, partner: AuthenticatedPartner, ids: string[],
  loadPrice: () => Promise<PartnerLeadPrice> = getPartnerLeadPrice) {
  const purchases: LeadPurchaseTerms[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from("lead_purchases").select(purchaseTermsColumns)
      .in("request_id", ids.slice(offset, offset + 100)).eq("status", "pending").order("purchased_at", { ascending: false });
    if (error) throw error;
    purchases.push(...(data ?? []));
  }
  let price: PartnerLeadPrice | null = null;
  if (partner.leads_paid && ids.some(id => !purchases.some(p => p.request_id === id))) {
    try { price = await loadPrice(); } catch { /* Disable new paid acquisitions when the real price cannot be confirmed. */ }
  }
  const states = new Map<string, { billing: PartnerLeadBilling; ownReservation: boolean; reservedElsewhere: boolean }>();
  for (const id of ids) {
    const pending = purchases.filter(p => p.request_id === id);
    const own = pending.find(p => p.partner_id === partner.id);
    const elsewhere = pending.some(p => p.partner_id !== partner.id);
    const billing = own ? billingFromPurchase(own) : { paymentRequired: partner.leads_paid,
      amount: partner.leads_paid ? price?.amount ?? null : 0, currency: price?.currency ?? "eur",
      reserved: false, available: !partner.leads_paid || Boolean(price) };
    states.set(id, { billing, ownReservation: Boolean(own), reservedElsewhere: elsewhere });
  }
  return states;
}

export function partnerAcquisitionError(error: unknown): never {
  const code = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  const errors: Record<string, [number,string]> = {
    PARTNER_REQUIRED: [403, "Aucun accès partenaire actif n’est associé à ce compte."],
    LEAD_NOT_FOUND: [404, "Dossier introuvable."],
    LEAD_UNAVAILABLE: [403, "Ce dossier n’est pas disponible pour votre compte partenaire."],
    LEAD_RESERVED: [409, "Une acquisition est déjà en cours pour ce dossier. Ses conditions restent réservées jusqu’à sa confirmation ou son expiration."],
    PARTNER_ASSIGNMENT_CONFLICT: [409, "Ce dossier a déjà été attribué à un autre partenaire."],
    BILLING_TERMS_CHANGED: [409, "Les conditions de prise en charge ont changé. Actualisez le dossier pour consulter le tarif avant de poursuivre."],
    CHECKOUT_CONFLICT: [409, "Cette réservation a évolué. Actualisez le dossier avant de poursuivre."],
    SESSION_MISMATCH: [409, "La page de paiement ne correspond plus à cette réservation. Actualisez le dossier."],
  };
  if (errors[code]) throw new HttpError(...errors[code]);
  throw error;
}
