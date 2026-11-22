import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/client-auth";
import { clientTokenConfirmationUrl } from "@/lib/client-access";
import { sendClientAccessLink } from "@/lib/email";
import { apiError, HttpError, readJson } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  next: z.enum(["diagnostic", "premium", "recovery", "admin", "visio", "carnet", "releves", "notices", "assistant", "forum", "compte", "partenaire"]),
  problemType: z.string().max(60).optional(),
  dossier: z.string().uuid().optional(),
  section: z.enum(["diagnostic", "followup", "documents", "history"]).optional(),
  tab: z.enum(["partners", "clients"]).optional(),
}).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const payload = schema.parse(await readJson(request, 1500));
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin || !process.env.RESEND_API_KEY) throw new HttpError(503, "L’envoi du lien est momentanément indisponible.");
    const supabase = getSupabaseAdmin();
    const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0,120);
    await rateLimit(supabase, "access:global", 200, 3600);
    await rateLimit(supabase, `access:ip:${hash(ip)}`, 20, 3600);
    await rateLimit(supabase, `access:email:${hash(payload.email)}`, 6, 3600);
    await rateLimit(supabase, `access:cooldown:${hash(payload.email)}`, 1, 60);
    if (payload.next === "admin") {
      const members = await supabase.from("admin_users").select("user_id").eq("active", true);
      if (members.error) throw members.error;
      const identities = await Promise.all((members.data || []).map(member => supabase.auth.admin.getUserById(member.user_id)));
      if (identities.some(identity => identity.error)) throw new Error("Administrator identity check unavailable");
      const allowed = identities.some(({ data }) => data.user?.email?.toLowerCase() === payload.email && data.user.email_confirmed_at &&
        !(data.user.banned_until && Date.parse(data.user.banned_until) > Date.now()));
      if (!allowed) return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const generated = await supabase.auth.admin.generateLink({ type: payload.next === "recovery" ? "recovery" : "magiclink", email: payload.email });
    // Do not reveal whether an address is registered or blocked. A token is
    // delivered only by e-mail; it is never returned to the requesting browser.
    const user = generated.data?.user;
    if (generated.error || !user || (user.banned_until && Date.parse(user.banned_until) > Date.now()))
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    const token = generated.data.properties?.hashed_token;
    if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error("Invalid confirmation token");
    const url = clientTokenConfirmationUrl(origin, token, payload.next, payload.problemType, { dossier: payload.dossier, section: payload.section, tab: payload.tab });
    const delivery = await sendClientAccessLink(payload.email, url, payload.next === "recovery", `access:${hash(token)}`);
    if (delivery.skipped) throw new HttpError(503, "Le lien n’a pas pu être envoyé. Réessayez dans une minute.");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
