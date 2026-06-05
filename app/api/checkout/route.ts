import { NextResponse } from "next/server";
import { z } from "zod";
import { remotePlans } from "@/lib/questions";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

const checkoutSchema = z.object({
  diagnosticId: z.string().uuid(),
  paymentPlan: z.enum(["photo", "guided", "premium"])
});

export async function POST(request: Request) {
  try {
    const payload = checkoutSchema.parse(await request.json());
    const selectedPlan = remotePlans.find((plan) => plan.id === payload.paymentPlan);
    if (!selectedPlan) {
      return NextResponse.json({ error: "Formule inconnue." }, { status: 400 });
    }

    const price = process.env[selectedPlan.stripeEnv];
    if (!price) {
      return NextResponse.json({ error: `Variable ${selectedPlan.stripeEnv} manquante.` }, { status: 400 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/paiement`,
      metadata: {
        diagnostic_id: payload.diagnosticId,
        payment_plan: payload.paymentPlan
      }
    });

    await supabase.from("payments").insert({
      diagnostic_id: payload.diagnosticId,
      stripe_session_id: session.id,
      amount: selectedPlan.price * 100,
      currency: "eur",
      status: "pending",
      plan: payload.paymentPlan
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
