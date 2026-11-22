import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "./http";
import { needsPartnerPasswordChange } from "./partner-navigation";

const accessRole = z.enum(["owner", "technician"]).optional();
export const partnerAccessSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("lookup"), email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(150) }).strict(),
  z.object({ mode: z.literal("create"), email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(150), password: z.string().min(12).max(128), role: accessRole }).strict(),
  z.object({ mode: z.literal("link"), email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(150), existingUserId: z.string().uuid(), reactivate: z.boolean().default(false), role: accessRole,
    planningLine: z.object({ id: z.string().uuid(), expected: z.string().uuid().nullable() }).strict().optional() }).strict()
]).refine(input => input.mode !== "link" || !input.planningLine || input.role === "technician");
export type PartnerAccessInput = z.infer<typeof partnerAccessSchema>;

type AccessAccount = Pick<User, "id" | "email_confirmed_at" | "banned_until" | "app_metadata">;

async function userByEmail(supabase: SupabaseClient, actorId: string, email: string): Promise<AccessAccount | null> {
  const { data, error } = await supabase.rpc("find_admin_partner_account", { p_actor: actorId, p_email: email });
  if (error?.message === "ACCOUNT_EMAIL_AMBIGUOUS")
    throw new HttpError(409, "Plusieurs comptes correspondent à cette adresse. Vérifiez l’adresse de votre collaborateur.");
  if (error?.message === "ADMIN_REQUIRED") throw new HttpError(403, "Accès administrateur requis.");
  if (error) throw new HttpError(503, "Impossible de vérifier cette adresse. Réessayez dans un instant.");
  return data;
}
export async function createPartnerAccess(supabase: SupabaseClient, partnerId: string, actorId: string, input: PartnerAccessInput) {
  const { data: company, error } = await supabase.from("partners").select("id,active").eq("id", partnerId).maybeSingle();
  if (error) throw error;
  if (!company?.active) throw new HttpError(409, "Activez d’abord l’entreprise partenaire avant de créer son accès.");
  let user = await userByEmail(supabase, actorId, input.email);
  let created = false;
  if (input.mode === "lookup") {
    if (!user) throw new HttpError(404, "Aucun compte de connexion ne correspond à cette adresse. Choisissez « Créer un nouveau compte » pour préparer son accès.");
    return { conflict: true as const, existingUserId: user.id, message: "Compte existant trouvé. Vérifiez l’entreprise puis confirmez son rattachement. Son mot de passe sera conservé." };
  }
  if (input.mode === "create") {
    if (user) return { conflict: true as const, existingUserId: user.id, message: "Cette adresse possède déjà un compte. Son mot de passe n’a pas été modifié. Vérifiez l’entreprise puis confirmez explicitement le rattachement ci-dessous." };
    const result = await supabase.auth.admin.createUser({ email: input.email, password: input.password,
      email_confirm: true, user_metadata: { name: input.name }, app_metadata: { partner_password_change_required: true } });
    if (result.error || !result.data.user) {
      // A concurrent creation may have won; do not retry with another password.
      throw new HttpError(409, "Le compte n’a pas pu être créé. Vérifiez l’adresse et réessayez pour contrôler un éventuel compte existant. Aucun mot de passe existant n’a été remplacé.");
    }
    user = result.data.user; created = true;
  } else if (!user || user.id !== input.existingUserId) {
    throw new HttpError(409, "Le compte existant a changé. Recommencez la vérification de cette adresse avant de confirmer son rattachement.");
  }
  if (!user) throw new HttpError(503, "La création du compte n’a pas pu être confirmée.");
  if (!user.email_confirmed_at || (user.banned_until && Date.parse(user.banned_until) > Date.now()))
    throw new HttpError(409, "Ce compte doit être confirmé ou réactivé avant de pouvoir accéder à l’espace partenaire. Son mot de passe n’a pas été modifié.");
  const link = { p_partner: partnerId, p_user: user.id, p_actor: actorId,
    p_contact: input.name, p_reactivate: input.mode === "link" && input.reactivate };
  const line = input.mode === "link" ? input.planningLine : undefined;
  const linked = line
    ? await supabase.rpc("link_partner_technician_account", { ...link, p_technician: line.id, p_expected: line.expected })
    : await supabase.rpc("link_partner_account", { ...link, ...(input.role === "technician" ? { p_role: input.role } : {}) });
  if (linked.error) {
    const reason = linked.error.code === "23505" && line ? "Cette ligne du planning est déjà liée à un autre compte technicien."
      : linked.error.code === "23503" && line ? "Cette ligne ne fait plus partie du planning de l’entreprise."
      : linked.error.message === "TECHNICIAN_LINK_CHANGED" ? "La ligne de ce compte a changé. Vérifiez le compte à nouveau avant de confirmer."
      : linked.error.message === "ACCOUNT_LINKED_ELSEWHERE" ? "Ce compte est déjà rattaché à une autre entreprise. Aucun transfert automatique n’a été effectué."
      : linked.error.message === "PARTNER_ROLE_CONFLICT" ? "Ce compte possède déjà un accès responsable pour cette entreprise."
      : linked.error.message === "ACCESS_INACTIVE" ? "Le rattachement existant est désactivé. Confirmez explicitement sa réactivation."
      : "Le rattachement à l’entreprise n’a pas pu être confirmé. Vérifiez l’accès puis réessayez.";
    throw new HttpError(409, `${created ? "Le compte de connexion a été créé, mais l’accès partenaire n’est pas prêt. " : ""}${reason}`);
  }
  return { ready: true as const, userId: user.id, passwordChangeRequired: needsPartnerPasswordChange(user),
    message: created ? "Accès créé et rattaché à cette entreprise. Transmettez le mot de passe provisoire au contact par un canal sûr ; il devra le remplacer à sa première connexion. Aucun e-mail n’a été envoyé."
      : line ? "Compte rattaché à la ligne du planning. Le technicien retrouve ses rendez-vous dans « Ma journée »."
      : input.role === "technician" ? "Compte rattaché comme technicien. Il peut utiliser son mot de passe SANISPA habituel."
      : "Compte existant rattaché à cette entreprise. Son mot de passe a été conservé. Aucun e-mail n’a été envoyé." };
}
