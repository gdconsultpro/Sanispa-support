export const maintenanceUnits = { day: "jours", week: "semaines", month: "mois", year: "ans" } as const;
export type MaintenanceUnit = keyof typeof maintenanceUnits;
export type SpaMaintenanceView = {
  plan: { id: string; frequency: number; unit: MaintenanceUnit; next_due_on: string; active: boolean; updated_at: string } | null;
  upcoming: { id: string; starts_at: string | null; maintenance_due_on: string } | null;
};
const dueDateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
export const maintenanceDate = (value: string) => dueDateFormatter.format(new Date(value + "T00:00:00Z"));
