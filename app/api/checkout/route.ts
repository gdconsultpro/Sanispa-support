import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, rateLimit, ownsDiagnostic } from "@/lib/client-auth";
import { readJson, apiError, HttpError } from "@/lib/http";
import { premiumActive, premiumCheckout } from "@/lib/customer-premium";
// Saved entry point retained; all new purchases use the monthly Premium offer.
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    await rateLimit(supabase, `checkout:${user.id}`, 6);
    const p = z.object({ diagnosticId: z.string().uuid(), paymentPlan: z.literal("water") }).strict().parse(await readJson(request, 1000));
    if (!await ownsDiagnostic(supabase, p.diagnosticId, user.id)) throw new HttpError(404, "Dossier introuvable.");
    const origin = process.env.NEXT_PUBLIC_APP_URL; if (!origin) throw new HttpError(503, "URL de retour non configurée.");
    const existing = await supabase.from("customer_subscriptions").select("status,paid_until").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (premiumActive(existing.data)) return NextResponse.json({ url: `${origin}/premium/assistant?topic=eau&diagnosticId=${p.diagnosticId}`, paid: true });
    return NextResponse.json(await premiumCheckout(supabase, user, origin));
  } catch (e) { return apiError(e); }
}
