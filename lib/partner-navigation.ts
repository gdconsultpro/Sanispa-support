import { partnerClientsPath, partnerMapPath, partnerNewClientPath, partnerNewVisitPath } from "./partner-planner";

/** Only known partner screens may be used as post-authentication destinations. */
export function partnerReturnPath(value: string | null | undefined) {
  if (!value) return "/partenaire";
  if (value === partnerClientsPath || value === partnerNewClientPath || value === partnerMapPath || value === partnerNewVisitPath) return value;
  if (/^\/partenaire\/planning\?view=carte&visite=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}&(?:jour=\d{4}-\d{2}-\d{2}|statut=pending)$/i.test(value)) return value;
  if (value.startsWith("/partenaire/abonnement?retour=")) {
    const offer = partnerOfferReturn(new URLSearchParams(value.slice(value.indexOf("?"))).get("retour"));
    if (offer) return partnerCharterPath(offer);
  }
  return /^\/partenaire(?:\/(?:planning|visio|abonnement|leads(?:\/[a-f0-9-]{36})?|interventions(?:\/[a-f0-9-]{36})?))?$/i.test(value) ? value : "/partenaire/leads";
}
export function partnerOfferReturn(value: string | null) {
  return value && /^\/partenaire\/leads\/[a-f0-9-]{36}$/i.test(value) ? value : null;
}
export function partnerCharterPath(offer: string) {
  return "/partenaire/abonnement?retour=" + encodeURIComponent(offer);
}
export function partnerLoginPath(next?: string | null) {
  return `/partenaire/connexion?next=${encodeURIComponent(partnerReturnPath(next))}`;
}
export function partnerPasswordPath(next?: string | null) {
  return `/partenaire/mot-de-passe?next=${encodeURIComponent(partnerReturnPath(next))}`;
}
export function needsPartnerPasswordChange(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.partner_password_change_required === true;
}
export async function withPartnerTimeout<T>(operation: Promise<T>, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Le service met trop de temps à répondre. Vérifiez votre connexion puis réessayez.")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
