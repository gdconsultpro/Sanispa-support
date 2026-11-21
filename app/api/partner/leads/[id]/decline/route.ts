import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { processNotifications } from "@/lib/notifications";
import { getAuthenticatedPartner } from "@/lib/partner-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, partner, supabase } = await getAuthenticatedPartner(request);
    if (!user || !partner) throw new HttpError(401, "Connexion partenaire requise.");
    const id = z.string().uuid().parse((await params).id);
    const { offeredAt } = z.object({ offeredAt: z.string().datetime({ offset: true }) }).strict().parse(await readJson(request, 1000));
    await rateLimit(supabase, "partner-decline:" + partner.id, 30);
    const { data: jobKey, error } = await supabase.rpc("decline_partner_offer", {
      p_diagnostic: id, p_partner: partner.id, p_actor: user.id, p_offered_at: offeredAt,
    });
    if (error?.message.includes("OFFER_UNAVAILABLE")) throw new HttpError(409, "Cette proposition a changé. Actualisez la demande.");
    if (error) throw error;
    if (jobKey) {
      try { await processNotifications(jobKey); }
      catch { console.error("Notification d’indisponibilité à relancer."); }
    }
    return NextResponse.json({ declined: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
