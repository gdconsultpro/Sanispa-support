import { hasOverdueAction, type AdminActivity } from "./admin-dossier";
import { partnerDispatchDecision } from "./partner-release";
import type { AdminDiagnostic } from "./types";

export const adminInboxViews = [
  ["all", "Toutes"],
  ["new", "Nouvelles"],
  ["assign", "À attribuer"],
  ["declined", "À réattribuer"],
  ["waiting", "Réponses attendues"],
  ["due", "Actions échues"],
] as const;
export type AdminInboxView = (typeof adminInboxViews)[number][0];

export function adminInboxView(input?: string): AdminInboxView {
  return adminInboxViews.find(([view]) => view === input)?.[0] || "all";
}

export function adminInboxFlags(dossier: AdminDiagnostic, activity: AdminActivity[], now: number) {
  const disposition = partnerDispatchDecision(dossier);
  const awaitingDecision = disposition === "pending";
  const declined = awaitingDecision && activity.some(event => event.event_type === "partner_declined");
  const open = !dossier.archived_at && !["CLOSED", "terminé"].includes(dossier.status);
  return {
    all: true,
    new: open && ["NEW", "AVAILABLE", "nouvelle", "WATER_ANALYSIS"].includes(dossier.status)
      && !declined && !dossier.assigned_partner_id && (awaitingDecision || disposition === null),
    assign: open && awaitingDecision && !declined,
    declined: open && declined,
    waiting: open && disposition === "released" && !dossier.assigned_partner_id,
    due: hasOverdueAction(dossier, now),
  };
}
