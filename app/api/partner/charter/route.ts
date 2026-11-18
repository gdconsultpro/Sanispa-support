import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { partnerCharterVersion } from "@/lib/partner-charter";
export async function GET(request: Request) {
  try {
    const { partner, supabase } = await getAuthenticatedPartner(request);
    if (!partner) throw new HttpError(401, "Connexion partenaire requise.");
    const result = await supabase.from("partner_charter_acceptances").select("accepted_at").eq("partner_id", partner.id).eq("version", partnerCharterVersion).maybeSingle();
    if (result.error) throw result.error;
    return NextResponse.json({ acceptedAt: result.data?.accepted_at || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const { partner, user, supabase } = await getAuthenticatedPartner(request);
    if (!partner || !user) throw new HttpError(401, "Connexion partenaire requise.");
    const payload = z.object({ version: z.literal(partnerCharterVersion), accepted: z.literal(true) }).strict().parse(await readJson(request, 1000));
    const result = await supabase.rpc("accept_partner_charter", { p_partner: partner.id, p_actor: user.id, p_version: payload.version });
    if (result.error) throw new HttpError(403, "Seul le responsable du compte partenaire peut accepter cette charte.");
    return NextResponse.json({ accepted: true });
  } catch (e) { return apiError(e); }
}
