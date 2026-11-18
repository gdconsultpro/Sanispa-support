import type Stripe from "stripe";
import { HttpError } from "./http";

export const partnerTaxPolicy = "fr-vat20-inclusive-v1";
const idOf = (value: unknown): string =>
  typeof value === "string" ? value : (value as { id?: string } | null)?.id || "";

export async function getPartnerTaxRate(
  stripe: Stripe,
  id = process.env.STRIPE_PARTNER_TAX_RATE_ID,
) {
  if (!id?.startsWith("txr_"))
    throw new HttpError(503, "La TVA partenaire doit être configurée par SANISPA.");
  const rate = await stripe.taxRates.retrieve(id);
  if (!rate.active || !rate.inclusive || rate.percentage !== 20 ||
      rate.country !== "FR" || rate.tax_type !== "vat")
    throw new HttpError(503, "Le taux de TVA partenaire doit être de 20 % inclus.");
  return rate.id;
}

/** Re-read with the SDK's pinned API, independently of the webhook format. */
export async function assertPartnerInvoiceTax(
  stripe: Stripe,
  invoiceId: string,
  gross: number,
  rateId: string,
) {
  if (!invoiceId || !rateId.startsWith("txr_")) throw new Error("PARTNER_TAX_MISSING");
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const taxes = invoice.total_tax_amounts;
  // Stripe rounds the tax-exclusive amount first for our single inclusive line.
  // 999 cents => 833 net + 166 VAT (not 832 + 167).
  const tax = gross - Math.round(gross * 5 / 6);
  if (invoice.status !== "paid" || invoice.currency !== "eur" ||
      invoice.total !== gross || invoice.amount_paid !== gross ||
      invoice.total_excluding_tax !== gross - tax ||
      !taxes?.length || taxes.some(t => !t.inclusive || idOf(t.tax_rate) !== rateId) ||
      taxes.reduce((sum, t) => sum + t.amount, 0) !== tax)
    throw new Error("PARTNER_TAX_MISMATCH");
}
