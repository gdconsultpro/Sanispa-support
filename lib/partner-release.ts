type DispatchDossier = {
  choice?: string | null; request_type?: string | null;
  partner_released_at?: string | null; partner_kept_at?: string | null;
  matched_partner_ids?: string[] | null; assigned_partner_id?: string | null;
  lead_purchase?: { status: string | null } | null;
};
export type PartnerDispatchDecision = "pending" | "internal" | "released" | "legacy";
export function partnerDispatchDecision(dossier: DispatchDossier): PartnerDispatchDecision | null {
  if (dossier.choice !== "intervention" || dossier.request_type !== "TECHNICAL_REQUEST") return null;
  if (dossier.partner_kept_at) return "internal";
  if (dossier.partner_released_at) return "released";
  if (dossier.assigned_partner_id || ["pending", "paid", "granted"].includes(dossier.lead_purchase?.status || "")) return "legacy";
  return "pending";
}
export const partnerDispatchLabels: Record<PartnerDispatchDecision,string> = {
  pending: "À valider", internal: "Conservé chez SANISPA", released: "Transmis au partenaire", legacy: "Acquisition antérieure conservée"
};
export function canViewPartnerOffer(dossier: DispatchDossier, partnerId: string, ownReservation = false) {
  if (ownReservation || dossier.choice !== "intervention") return true;
  return Boolean(!dossier.partner_kept_at && dossier.partner_released_at && dossier.matched_partner_ids?.length === 1 && dossier.matched_partner_ids[0] === partnerId);
}

export function canNotifyPartnerOffer(dossier: DispatchDossier & { archived_at?: string|null; status?: string }, job: {key:string;payload:{diagnosticId:string;partners?:Array<{id:string}>}}) {
  const recipient = job.payload.partners?.[0]?.id;
  return Boolean(recipient && dossier.request_type === "TECHNICAL_REQUEST" && !dossier.archived_at && !dossier.assigned_partner_id &&
    ["NEW","AVAILABLE","nouvelle"].includes(dossier.status || "") && job.payload.partners?.length === 1 &&
    dossier.matched_partner_ids?.includes(recipient) && canViewPartnerOffer(dossier,recipient) &&
    (dossier.choice !== "intervention" || job.key === `${job.payload.diagnosticId}:manual-partner:${recipient}`));
}

export type PartnerNotificationState = { state:string; sentAt:string|null };
export function partnerNotificationLabel(notification:PartnerNotificationState|null) {
  if (!notification) return "Aucune notification partenaire créée.";
  if (notification.state === "sent" && notification.sentAt) return "Envoi confirmé par le service d’e-mail.";
  if (notification.state === "cancelled") return "Notification annulée : cette offre n’est plus disponible.";
  if (notification.state === "delivery_unknown") return "Envoi à vérifier dans le service d’e-mail avant toute relance. Aucun nouvel envoi automatique.";
  return "Notification en attente d’une confirmation d’envoi. Actualisez son état pour vérifier.";
}
