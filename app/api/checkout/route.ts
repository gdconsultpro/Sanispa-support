import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { remotePlans } from "@/lib/questions";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

const checkoutSchema = z.object({
  diagnosticId: z.string().uuid(),
  paymentPlan: z.enum(["photo", "guided", "premium", "water"])
});

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function resumeUrl(origin: string, token: string) {
  return `${origin}/assistant-eau?token=${token}`;
}

export async function POST(request: Request) {
  try {
    const payload = checkoutSchema.parse(await request.json());
    const selectedPlan = remotePlans.find((plan) => plan.id === payload.paymentPlan);
    if (!selectedPlan) {
      return NextResponse.json({ error: "Formule inconnue." }, { status: 400 });
    }
    if (!selectedPlan.enabled) {
      return NextResponse.json({ error: "Cette formule n'est plus proposée aux clients." }, { status: 400 });
    }

    const price = process.env[selectedPlan.stripeEnv];
    if (!price) {
      return NextResponse.json({ error: `Variable ${selectedPlan.stripeEnv} manquante.` }, { status: 400 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    if (payload.paymentPlan === "water") {
      const validityDays = Number(process.env.WATER_ASSISTANCE_DAYS ?? "7");

      const { data: diagnostic, error: diagnosticError } = await supabase
        .from("diagnostics")
        .select("id, customer_id")
        .eq("id", payload.diagnosticId)
        .single();

      if (diagnosticError) throw diagnosticError;

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("name, email")
        .eq("id", diagnostic.customer_id)
        .single();

      if (customerError) throw customerError;

      const customerEmail = String(customer.email).toLowerCase();

      const { data: activeSession } = await supabase
        .from("water_assistance_sessions")
        .select("id, resume_token, expires_at")
        .eq("customer_email", customerEmail)
        .eq("status", "paid")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSession) {
        return NextResponse.json({ url: resumeUrl(origin, activeSession.resume_token), paid: true });
      }

      const { data: pendingSession } = await supabase
        .from("water_assistance_sessions")
        .select("id, resume_token")
        .eq("diagnostic_id", payload.diagnosticId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const assistanceSession =
        pendingSession ??
        (
          await supabase
            .from("water_assistance_sessions")
            .insert({
              diagnostic_id: payload.diagnosticId,
              customer_email: customerEmail,
              customer_name: customer.name,
              status: "pending",
              resume_token: randomUUID().replaceAll("-", ""),
              current_step: "payment",
              expires_at: addDays(1)
            })
            .select("id, resume_token")
            .single()
        ).data;

      if (!assistanceSession) {
        return NextResponse.json({ error: "Impossible de créer la session d'assistance." }, { status: 400 });
      }

      const successUrl = `${origin}/assistant-eau?token=${assistanceSession.resume_token}&session_id={CHECKOUT_SESSION_ID}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: customerEmail,
        line_items: [{ price, quantity: 1 }],
        success_url: successUrl,
        cancel_url: `${origin}/paiement`,
        metadata: {
          diagnostic_id: payload.diagnosticId,
          payment_plan: payload.paymentPlan,
          water_assistance_session_id: assistanceSession.id,
          resume_token: assistanceSession.resume_token
        }
      });

      await supabase
        .from("water_assistance_sessions")
        .update({
          stripe_checkout_session_id: session.id,
          expires_at: addDays(1),
          updated_at: new Date().toISOString()
        })
        .eq("id", assistanceSession.id);

      await supabase.from("payments").insert({
        diagnostic_id: payload.diagnosticId,
        stripe_session_id: session.id,
        amount: selectedPlan.price * 100,
        currency: "eur",
        status: "pending",
        plan: payload.paymentPlan
      });

      return NextResponse.json({ url: session.url });
    }

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
