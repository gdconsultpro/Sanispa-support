export type PrivatePartnerClient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  street: string;
  postal_code: string;
  city: string;
  intervention_type: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  source_diagnostic_id: string | null;
};

type Times = { starts_at: string; ends_at: string };
export type PrivatePartnerVisit = Times & {
  id: string;
  title: string;
  description: string;
  client: PrivatePartnerClient;
};
export type SanispaPartnerVisit = Times & {
  diagnostic_id: string;
  diagnostic: { problem_type: string; customer: { name: string | null; address: string | null } | null };
};

export const interventionTypes = ["Intervention SAV", "Mise en service", "Installation", "Entretien / révision"];

export type PrivatePartnerStock = {
  id: string;
  category: "piece" | "spa";
  label: string;
  reference: string;
  quantity: number;
  updated_at: string;
};

export type PlannerPeriod = "day" | "week" | "month";

export function plannerDate(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, "0")).join("-");
}

export function plannerDay(date: string, offset = 0) {
  const day = new Date(date + "T00:00");
  day.setDate(day.getDate() + offset);
  return day;
}

export function plannerRange(date: string, period: PlannerPeriod) {
  const from = plannerDay(date);
  if (period === "week") from.setDate(from.getDate() - (from.getDay() + 6) % 7);
  if (period === "month") from.setDate(1);
  const to = new Date(from);
  if (period === "month") to.setMonth(to.getMonth() + 1);
  else to.setDate(to.getDate() + (period === "week" ? 7 : 1));
  return { from, to };
}

export function plannerTime(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export function partnerClientAddress({ street, postal_code, city }: Pick<PrivatePartnerClient, "street" | "postal_code" | "city">) {
  return [street, [postal_code, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function partnerDirections(address: string) {
  return "https://www.google.com/maps/dir/?" + new URLSearchParams({ api: "1", destination: address });
}

export function visitsOverlap(left: Times, right: Times) {
  return Date.parse(left.starts_at) < Date.parse(right.ends_at) && Date.parse(right.starts_at) < Date.parse(left.ends_at);
}
