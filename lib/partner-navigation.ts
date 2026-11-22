import { partnerClientIdPattern, partnerClientsPath, partnerEditVisitPrefix, partnerMapPath, partnerNewClientPath, partnerNewVisitPath, partnerPrivateVisitsPath, partnerStockPath } from "./partner-planner";
import { readWorkspaceSelection } from "./partner-workspace";
import { partnerDayPath } from "./partner-day";
export const partnerAccountPath = "/partenaire/compte";

export function partnerLoginDestination(next: string | null, role?: string) {
  return partnerReturnPath(next || (role === "technician" ? partnerDayPath : partnerAccountPath));
}

/** Only known partner screens may be used as post-authentication destinations. */
export function partnerReturnPath(value: string | null | undefined) {
  if (!value) return "/partenaire";
  if (value === partnerAccountPath || value === partnerDayPath || value === partnerClientsPath || value === partnerNewClientPath || value === partnerMapPath || value === partnerNewVisitPath || value === partnerStockPath) return value;
  if (/^\/partenaire\/interventions\/[a-f0-9-]{36}\/gestion$/i.test(value)) return value;
  for (const prefix of [partnerClientsPath + "&fiche=", partnerPrivateVisitsPath, partnerEditVisitPrefix]) {
    if (value.startsWith(prefix) && partnerClientIdPattern.test(value.slice(prefix.length))) return value;
  }
  if (/^\/partenaire\/planning\?view=carte&visite=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}&(?:jour=\d{4}-\d{2}-\d{2}|statut=pending)$/i.test(value)) return value;
  if (/^\/partenaire\/(?:planning|interventions)\?[^#]+$/.test(value)) {
    const [path, search] = value.split("?", 2);
    const selection = readWorkspaceSelection(search);
    const params = new URLSearchParams(search);
    const isMap = path.endsWith("/planning") && params.get("view") === "carte";
    const checks: Record<string, boolean> = {
      jour: Boolean(selection.day), periode: Boolean(selection.period), statut: Boolean(selection.status),
      technicien: selection.technician !== undefined, view: isMap,
      intervention: isMap && /^(private|sanispa):[a-f0-9-]{36}$/i.test(params.get("intervention") ?? ""),
    };
    const keys = [...params.keys()];
    if (new Set(keys).size === keys.length && keys.every(key => checks[key] === true)) return value;
  }
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
