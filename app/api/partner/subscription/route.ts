import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { subscriptionCheckout } from "@/lib/partner-subscriptions";
import { getStripe } from "@/lib/stripe";
import { rateLimit } from "@/lib/client-auth";
export async function GET(request: Request) {
  try {
    const { partner, supabase } = await getAuthenticatedPartner(request);
    if (!partner) throw new HttpError(401, "Connexion partenaire requise.");
    const { data, error } = await supabase
      .from("partner_subscriptions")
      .select("plan,status,paid_until")
      .eq("partner_id", partner.id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(
      { subscription: data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { user, partner, supabase } = await getAuthenticatedPartner(request);
    if (!partner || !user)
      throw new HttpError(401, "Connexion partenaire requise.");
    await rateLimit(supabase, `subscription:${partner.id}`, 6);
    const payload = z
      .discriminatedUnion("action", [
        z
          .object({
            action: z.literal("subscribe"),
            plan: z.enum(["management", "complete"]),
          })
          .strict(),
        z.object({ action: z.literal("portal") }).strict(),
      ])
      .parse(await readJson(request, 1000));
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin) throw new HttpError(503, "URL de retour non configurée.");
    if (payload.action === "portal") {
      const { data, error } = await supabase
        .from("partner_subscriptions")
        .select("stripe_customer_id")
        .eq("partner_id", partner.id)
        .single();
      if (error || !data) throw new HttpError(404, "Aucun abonnement trouvé.");
      const session = await getStripe().billingPortal.sessions.create({
        customer: data.stripe_customer_id,
        return_url: `${origin}/partenaire/abonnement`,
      });
      return NextResponse.json({ url: session.url });
    }
    return NextResponse.json(
      await subscriptionCheckout(
        supabase,
        partner.id,
        user.id,
        payload.plan,
        origin,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
