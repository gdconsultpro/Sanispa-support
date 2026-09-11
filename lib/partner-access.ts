import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "./http";
import { needsPartnerPasswordChange } from "./partner-navigation";

export const partnerAccessSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("lookup"), email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(150) }).strict(),
  z.object({ mode: z.literal("create"), email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(150), password: z.string().min(12).max(128) }).strict(),
  z.object({ mode: z.literal("link"), email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(150), existingUserId: z.string().uuid(), reactivate: z.boolean().default(false) }).strict()
]);
export type PartnerAccessInput = z.infer<typeof partnerAccessSchema>;

async function userByEmail(supabase: SupabaseClient, email: string) {
  // Admin-only paginated Auth API: never replace a password when an address exists.
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new HttpError(503, "Impossible de vérifier si cette adresse possède déjà un compte. Aucun accès n’a été créé.");
    const user = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
  }
}
export async function createPartnerAccess(supabase: SupabaseClient, partnerId: string, actorId: string, input: PartnerAccessInput) {
  const { data: company, error } = await supabase.from("partners").select("id,active").eq("id", partnerId).maybeSingle();
  if (error) throw error;
  if (!company?.active) throw new HttpError(409, "Activez d’abord l’entreprise partenaire avant de créer son accès.");
  let user: User | null = await userByEmail(supabase, input.email);
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
  const linked = await supabase.rpc("link_partner_account", { p_partner: partnerId, p_user: user.id, p_actor: actorId,
    p_contact: input.name, p_reactivate: input.mode === "link" && input.reactivate });
  if (linked.error) {
    const reason = linked.error.message === "ACCOUNT_LINKED_ELSEWHERE" ? "Ce compte est déjà rattaché à une autre entreprise. Aucun transfert automatique n’a été effectué."
      : linked.error.message === "ACCESS_INACTIVE" ? "Le rattachement existant est désactivé. Confirmez explicitement sa réactivation."
      : "Le rattachement à l’entreprise n’a pas pu être confirmé. Vérifiez l’accès puis réessayez.";
    throw new HttpError(409, `${created ? "Le compte de connexion a été créé, mais l’accès partenaire n’est pas prêt. " : ""}${reason}`);
  }
  return { ready: true as const, userId: user.id, passwordChangeRequired: needsPartnerPasswordChange(user),
    message: created ? "Accès créé et rattaché à cette entreprise. Transmettez le mot de passe provisoire au contact par un canal sûr ; il devra le remplacer à sa première connexion. Aucun e-mail n’a été envoyé."
      : "Compte existant rattaché à cette entreprise. Son mot de passe a été conservé. Aucun e-mail n’a été envoyé." };
}
