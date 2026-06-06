import { NextResponse } from "next/server";
import { sendWaterAssistanceResumeLink } from "@/lib/email";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET manquant." }, { status: 400 });
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature Stripe manquante." }, { status: 400 });
  }

  try {
    const body = await request.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const diagnosticId = session.metadata?.diagnostic_id;
      const waterSessionId = session.metadata?.water_assistance_session_id;
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      const validityDays = Number(process.env.WATER_ASSISTANCE_DAYS ?? "7");
      const supabase = getSupabaseAdmin();

      if (diagnosticId) {
        await supabase
          .from("payments")
          .update({ status: "paid", stripe_payment_intent_id: String(session.payment_intent ?? "") })
          .eq("stripe_session_id", session.id);

        await supabase.from("diagnostics").update({ payment_status: "paid", status: "en analyse" }).eq("id", diagnosticId);
      }

      if (waterSessionId) {
        const paidExpiresAt = addDays(validityDays);
        const { data: waterSession } = await supabase
          .from("water_assistance_sessions")
          .update({
            status: "paid",
            current_step: "assistant",
            stripe_payment_intent_id: String(session.payment_intent ?? ""),
            paid_at: new Date().toISOString(),
            expires_at: paidExpiresAt,
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString()
          })
          .eq("id", waterSessionId)
          .select("customer_email, customer_name, resume_token")
          .single();

        if (waterSession) {
          await sendWaterAssistanceResumeLink({
            to: waterSession.customer_email,
            name: waterSession.customer_name || "Client SANISPA",
            resumeUrl: `${origin}/assistant-eau?token=${waterSession.resume_token}`,
            expiresAt: paidExpiresAt
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook invalide";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
