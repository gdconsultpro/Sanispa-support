export { forumPostSchema } from "./forum-validation";
import { requirePremium } from "./customer-premium";
import { HttpError } from "./http";
export function detectsSolicitation(value: string) {
  return /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}|(?:contactez[- ]moi|mes services|mon entreprise|devis gratuit|offre commerciale|code promo|démarchage)/i.test(value);
}
export function moderateForumPost(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase();
  const solicitation = detectsSolicitation(value)
    || /\b(?:je vends|nous vendons|a vendre|ma boutique|notre boutique|offre promotionnelle|profitez de|promotion exceptionnelle)\b/.test(normalized)
    || /\b[a-z0-9-]+\.(?:fr|com|net|org|eu|io)\b/.test(normalized);
  const personalData = /\b\d{1,4}(?:\s*(?:bis|ter))?\s+(?:rue|avenue|boulevard|chemin|impasse|allee|route|place)\b/.test(normalized)
    || /\b(?:arobase|mon adresse|numero de carte|mot de passe)\b/.test(normalized);
  const abuse = /\b(?:connard|connasse|encule|enculee|salope|ta gueule|va te faire|je vais te tuer)\b/.test(normalized);
  const unsafeAdvice = /\b(?:shunter|court[- ]circuiter|neutraliser|desactiver|contourner)\b.{0,60}\b(?:securite|protection|differentiel|disjoncteur|capteur)\b/.test(normalized)
    || /\bmelang\w*\b.{0,100}\b(?:chlore|javel)\b.{0,100}\bacide\b/.test(normalized)
    || /\bmelang\w*\b.{0,100}\bacide\b.{0,100}\b(?:chlore|javel)\b/.test(normalized);
  const spam = /(.)\1{14,}/.test(normalized);
  return { state: solicitation || personalData || abuse || unsafeAdvice || spam ? "pending" as const : "approved" as const, solicitationFlag: solicitation };
}
export async function requireForumClient(request: Request) {
  const context = await requirePremium(request);
  const membership = await context.supabase.from("partner_users").select("id,partners!inner(active)").eq("user_id", context.user.id).eq("active", true).eq("partners.active", true).limit(1);
  if (membership.error) throw membership.error;
  if (membership.data?.length) throw new HttpError(403, "Ce compte ne dispose pas de l’accès au forum des particuliers.");
  return context;
}
