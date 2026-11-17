export const leadCatalog = {
  fuite: { label: "Fuite", amount: 2500 },
  pompe: { label: "Pompe", amount: 5900 },
  electrique: { label: "Disjonction", amount: 4900 },
  "carte-mere": { label: "Carte mère", amount: 6900 },
  intemperies: { label: "Inondation / intempéries", amount: 8900 },
  chauffage: { label: "Chauffage", amount: 4900 },
  filtration: { label: "Filtration", amount: 4900 },
  "clavier-ecran": { label: "Clavier", amount: 3900 },
  autre: { label: "Autre", amount: 2000 },
} as const;
export type LeadCategory = keyof typeof leadCatalog;
export const subscriptionPlans = {
  management: {
    label: "Gestion + leads à la demande",
    amount: 30000,
    description:
      "300 € TTC / mois de gestion, puis règlement de chaque contact selon sa catégorie.",
  },
  complete: {
    label: "Complet",
    amount: 70000,
    description:
      "700 € TTC / mois. Contacts inclus, uniquement après validation et transmission par SANISPA.",
  },
} as const;
export type SubscriptionPlan = keyof typeof subscriptionPlans;
export function activeSubscription(
  subscription: { status: string; paid_until: string } | null,
  now = Date.now(),
) {
  return Boolean(
    subscription?.status === "active" &&
      Date.parse(subscription.paid_until) > now,
  );
}
