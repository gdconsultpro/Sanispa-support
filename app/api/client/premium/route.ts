import { paymentsPaused } from "@/lib/commercial-mode";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/client-auth";
import { premiumActive, premiumCheckout } from "@/lib/customer-premium";
import { apiError, HttpError, readJson } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { createSanispaPortal } from "@/lib/stripe-portal";
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const result = await supabase.from("customer_subscriptions").select("status,paid_until").eq("user_id", user.id).maybeSingle();
    if (result.error) throw result.error;
    let active = premiumActive(result.data);
    if (paymentsPaused()) { const trial = await supabase.rpc("grant_customer_trial_access", { p_user: user.id }); if (trial.error) throw trial.error; active = trial.data === true; }
    return NextResponse.json({ subscription: result.data, active, complimentary: paymentsPaused() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    await rateLimit(supabase, `premium-checkout:${user.id}`, 6);
    const payload = z.object({ action: z.enum(["subscribe", "portal"]) }).strict().parse(await readJson(request, 1000));
    const origin = process.env.NEXT_PUBLIC_APP_URL; if (!origin) throw new HttpError(503, "URL de retour non configurée.");
    if (paymentsPaused()) return NextResponse.json({url:`${origin}/premium`,complimentary:true});
    if (payload.action === "subscribe") return NextResponse.json(await premiumCheckout(supabase, user, origin));
    const result = await supabase.from("customer_subscriptions").select("stripe_customer_id").eq("user_id", user.id).single();
    if (result.error || !result.data) throw new HttpError(404, "Aucun abonnement trouvé.");
    const session = await createSanispaPortal(getStripe(), result.data.stripe_customer_id, `${origin}/premium`);
    return NextResponse.json({ url: session.url });
  } catch (e) { return apiError(e); }
}
