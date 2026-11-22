import { getAuthenticatedUser } from "./client-auth";
import { HttpError } from "./http";
import { needsPartnerPasswordChange } from "./partner-navigation";
export type AuthenticatedPartner = {
  id: string; company_name: string; contact_name: string | null; email: string;
  verification_status?: "existing" | "pending" | "verified"; active: boolean; role: string; leads_paid: boolean;
};
export async function getAuthenticatedPartner(request: Request, options: { allowPasswordChange?: boolean } = {}) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return { user: null, partner: null, supabase, passwordChangeRequired: false, technicianId: null as string | null };
  const { data, error } = await supabase.from("partner_users")
    .select("role, active, technician_id, partners!inner(id, company_name, contact_name, email, active, leads_paid, verification_status)")
    .eq("user_id", user.id);
  if (error) throw new HttpError(503, "Votre identité est reconnue, mais la vérification de votre accès partenaire a échoué. Réessayez.");
  const active = (data ?? []).filter((row: any) => row.active && (Array.isArray(row.partners) ? row.partners[0] : row.partners)?.active);
  if (active.length > 1) throw new HttpError(403, "Votre compte est rattaché à plusieurs entreprises. Contactez SANISPA pour faire corriger ce rattachement.");
  if (!active.length) throw new HttpError(403, data?.length
    ? "Votre connexion est réussie, mais votre accès partenaire ou votre entreprise est désactivé. Contactez SANISPA."
    : "Votre connexion est réussie, mais ce compte n’est rattaché à aucune entreprise. Complétez votre inscription pour créer votre espace partenaire gratuit.",
    data?.length ? undefined : "PARTNER_REGISTRATION_REQUIRED");
  const row = active[0] as any;
  const company = Array.isArray(row.partners) ? row.partners[0] : row.partners;
  const partner: AuthenticatedPartner = { ...company, role: row.role ?? "owner", leads_paid: company.leads_paid !== false };
  // Live Auth metadata is controlled by the server, never by the browser.
  const passwordChangeRequired = needsPartnerPasswordChange(user);
  if (passwordChangeRequired && !options.allowPasswordChange)
    throw new HttpError(428, "Choisissez votre mot de passe personnel avant d’accéder aux dossiers partenaires.");
  return { user, partner, supabase, passwordChangeRequired, technicianId: row.technician_id as string | null };
}

export async function requirePartnerPlanner(request: Request) {
  const context = await getAuthenticatedPartner(request);
  if (!context.partner || !context.user) throw new HttpError(401, "Connexion partenaire requise.");
  if (context.partner.verification_status === "pending")
    throw new HttpError(403, "Votre planning sera disponible après la validation de votre entreprise.");
  return { ...context, partner: context.partner, user: context.user };
}

export function assertPartnerOwner(partner: AuthenticatedPartner) {
  if (partner.role !== "owner")
    throw new HttpError(403, "Cette rubrique est réservée au responsable de l’entreprise.", "PARTNER_OWNER_REQUIRED");
}

export async function requirePartnerOwner(request: Request) {
  const context = await getAuthenticatedPartner(request);
  if (!context.partner || !context.user) throw new HttpError(401, "Connexion partenaire requise.");
  assertPartnerOwner(context.partner);
  return { ...context, partner: context.partner, user: context.user };
}

export async function requirePartnerPlanningOwner(request: Request) {
  const context = await requirePartnerPlanner(request);
  assertPartnerOwner(context.partner);
  return context;
}

export async function hasPartnerAppointment(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  partnerId: string,
  diagnosticId: string,
  technicianId: string | null,
) {
  if (!technicianId) return false;
  const { data, error } = await supabase.from("partner_appointments").select("diagnostic_id")
    .eq("partner_id", partnerId).eq("diagnostic_id", diagnosticId).eq("technician_id", technicianId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
