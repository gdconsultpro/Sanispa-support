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
  demenagement: { label: "Déménagement de spa", amount: 5000 },
} as const;
export type LeadCategory = keyof typeof leadCatalog;
export const subscriptionPlans = {
  management: {
    label: "Gestion et communication",
    amount: 35000,
    description:
      "350 € TTC / mois de gestion et de communication, puis règlement de chaque contact après validation SANISPA.",
  },
  complete: {
    label: "Ancien forfait complet — historique des tests",
    amount: 70000,
    description:
      "700 € TTC / mois. Contacts inclus, uniquement après validation et transmission par SANISPA.",
  },
} as const;
export const availableSubscriptionPlans = { management: subscriptionPlans.management };
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
