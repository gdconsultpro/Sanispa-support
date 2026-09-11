export function canViewPartnerOffer(dossier: { choice?: string | null; partner_released_at?: string | null; matched_partner_ids?: string[] }, partnerId: string, ownReservation = false) {
  if (ownReservation || dossier.choice !== "intervention") return true;
  return Boolean(dossier.partner_released_at && dossier.matched_partner_ids?.length === 1 && dossier.matched_partner_ids[0] === partnerId);
}
