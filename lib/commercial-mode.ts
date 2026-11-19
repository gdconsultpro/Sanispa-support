/** Fail closed: taking payments again requires an explicit release in live mode. */
export function paymentsPaused() {
  return process.env.NEXT_PUBLIC_SANISPA_BILLING_MODE !== "live";
}

export const videoAssistanceOffer = { amount: 5900, durationMinutes: 30, currency: "eur" } as const;

export const complimentaryMessage = "Services gratuits actuellement · aucun abonnement ni prélèvement";
