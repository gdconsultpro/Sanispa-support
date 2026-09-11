import { getAuthenticatedUser } from "./client-auth";
import { HttpError } from "./http";
import { needsPartnerPasswordChange } from "./partner-navigation";
export type AuthenticatedPartner = {
  id: string; company_name: string; contact_name: string | null; email: string;
  active: boolean; role: string; leads_paid: boolean;
};
export async function getAuthenticatedPartner(request: Request, options: { allowPasswordChange?: boolean } = {}) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return { user: null, partner: null, supabase, passwordChangeRequired: false };
  const { data, error } = await supabase.from("partner_users")
    .select("role, active, partners!inner(id, company_name, contact_name, email, active, leads_paid)")
    .eq("user_id", user.id);
  if (error) throw new HttpError(503, "Votre identité est reconnue, mais la vérification de votre accès partenaire a échoué. Réessayez.");
  const active = (data ?? []).filter((row: any) => row.active && (Array.isArray(row.partners) ? row.partners[0] : row.partners)?.active);
  if (active.length > 1) throw new HttpError(403, "Votre compte est rattaché à plusieurs entreprises. Contactez SANISPA pour faire corriger ce rattachement.");
  if (!active.length) throw new HttpError(403, data?.length
    ? "Votre connexion est réussie, mais votre accès partenaire ou votre entreprise est désactivé. Contactez SANISPA."
    : "Votre connexion est réussie, mais ce compte n’est rattaché à aucune entreprise partenaire. Demandez à SANISPA de créer votre accès dans Administration → Partenaires.");
  const row = active[0] as any;
  const company = Array.isArray(row.partners) ? row.partners[0] : row.partners;
  const partner: AuthenticatedPartner = { ...company, role: row.role ?? "owner", leads_paid: company.leads_paid !== false };
  // Live Auth metadata is controlled by the server, never by the browser.
  const passwordChangeRequired = needsPartnerPasswordChange(user);
  if (passwordChangeRequired && !options.allowPasswordChange)
    throw new HttpError(428, "Choisissez votre mot de passe personnel avant d’accéder aux dossiers partenaires.");
  return { user, partner, supabase, passwordChangeRequired };
}
