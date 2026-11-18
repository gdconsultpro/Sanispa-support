import { z } from "zod";
import { requirePremium } from "./customer-premium";
import { HttpError } from "./http";
export const forumPostSchema = z.object({ title: z.string().trim().max(150).default(""), body: z.string().trim().min(10).max(3000), parentId: z.string().uuid().nullable().default(null) }).strict().refine(p => p.parentId || p.title.length >= 5);
export function detectsSolicitation(value: string) {
  return /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}|(?:contactez[- ]moi|mes services|mon entreprise|devis gratuit|offre commerciale|code promo|démarchage)/i.test(value);
}
export async function requireForumClient(request: Request) {
  const context = await requirePremium(request);
  const membership = await context.supabase.from("partner_users").select("id,partners!inner(active)").eq("user_id", context.user.id).eq("active", true).eq("partners.active", true).limit(1);
  if (membership.error) throw membership.error;
  if (membership.data?.length) throw new HttpError(403, "Le forum est réservé aux particuliers Premium. Les comptes partenaires n’y interviennent pas.");
  return context;
}
