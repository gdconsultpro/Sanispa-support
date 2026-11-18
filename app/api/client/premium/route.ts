import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/client-auth";
import { premiumActive, premiumCheckout } from "@/lib/customer-premium";
import { apiError, HttpError, readJson } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const result = await supabase.from("customer_subscriptions").select("status,paid_until").eq("user_id", user.id).maybeSingle();
    if (result.error) throw result.error;
    return NextResponse.json({ subscription: result.data, active: premiumActive(result.data) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    await rateLimit(supabase, `premium-checkout:${user.id}`, 6);
    const payload = z.object({ action: z.enum(["subscribe", "portal"]) }).strict().parse(await readJson(request, 1000));
    const origin = process.env.NEXT_PUBLIC_APP_URL; if (!origin) throw new HttpError(503, "URL de retour non configurée.");
    if (payload.action === "subscribe") return NextResponse.json(await premiumCheckout(supabase, user, origin));
    const result = await supabase.from("customer_subscriptions").select("stripe_customer_id").eq("user_id", user.id).single();
    if (result.error || !result.data) throw new HttpError(404, "Aucun abonnement trouvé.");
    const session = await getStripe().billingPortal.sessions.create({ customer: result.data.stripe_customer_id, return_url: `${origin}/premium` });
    return NextResponse.json({ url: session.url });
  } catch (e) { return apiError(e); }
}
