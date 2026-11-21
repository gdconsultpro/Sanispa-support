import type { CustomerInfo } from "./types";

export const contactFields = ["name", "phone", "email", "address", "postalCode", "city"] as const;
export type ContactField = (typeof contactFields)[number];
export const contactLabels: Record<ContactField, string> = {
  name: "Nom", phone: "Téléphone", email: "Adresse e-mail", address: "Adresse",
  postalCode: "Code postal", city: "Ville",
};

export function missingContactFields(draft: Pick<CustomerInfo, ContactField>) {
  return contactFields.filter(field => field !== "address" && !draft[field]?.trim());
}
