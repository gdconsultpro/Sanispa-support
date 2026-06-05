import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

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
      const supabase = getSupabaseAdmin();

      if (diagnosticId) {
        await supabase
          .from("payments")
          .update({ status: "paid", stripe_payment_intent_id: String(session.payment_intent ?? "") })
          .eq("stripe_session_id", session.id);

        await supabase.from("diagnostics").update({ payment_status: "paid", status: "en analyse" }).eq("id", diagnosticId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook invalide";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
