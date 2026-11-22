import { parisDateTime, planningLocalParts } from "./partner-availability";
import type { FieldSource } from "./partner-field";
import type { PartnerWorkStatus } from "./partner-workspace";

export const partnerDayPath = "/partenaire/ma-journee";

export type PartnerDayAppointment = {
  id: string;
  source: FieldSource;
  title: string;
  customer: string;
  phone: string | null;
  address: string;
  starts_at: string;
  ends_at: string;
  technician: string | null;
  status: PartnerWorkStatus;
};
export type PartnerDay = {
  day: string;
  scope: "team" | "personal" | "unlinked";
  appointments: PartnerDayAppointment[];
  more?: boolean;
};
export type PartnerTeamLinks = {
  technicians: { id: string; name: string }[];
  accounts: { user_id: string; name: string; active: boolean; technician_id: string | null }[];
};

export function partnerDayRange(now: Date) {
  const { day } = planningLocalParts(now.toISOString());
  const tomorrow = new Date(day + "T00:00:00Z");
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { day, from: parisDateTime(day + "T00:00"), to: parisDateTime(tomorrow.toISOString().slice(0, 10) + "T00:00") };
}
