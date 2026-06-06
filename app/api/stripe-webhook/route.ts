import { NextResponse } from "next/server";
import { sendCustomerConfirmation, sendWaterAssistanceResumeLink } from "@/lib/email";
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
        console.log("[SANISPA Stripe] paiement validé", { diagnosticId, stripeSessionId: session.id });

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
          try {
            await sendWaterAssistanceResumeLink({
              to: waterSession.customer_email,
              name: waterSession.customer_name || "Client SANISPA",
              resumeUrl: `${origin}/assistant-eau?token=${waterSession.resume_token}`,
              expiresAt: paidExpiresAt
            });
          } catch (emailError) {
            console.error("[SANISPA email client] erreur email reprise assistant eau", emailError);
          }
        }
      }

      if (diagnosticId && !waterSessionId) {
        try {
          const emailPayload = await loadDiagnosticEmailPayload(supabase, diagnosticId, origin);
          console.log("[SANISPA email client] appel confirmation client après paiement Stripe", {
            diagnosticId,
            to: emailPayload.customer.email,
            paymentPlan: emailPayload.paymentPlan
          });
          await sendCustomerConfirmation(emailPayload);
          await supabase
            .from("diagnostics")
            .update({ customer_email_status: "sent", customer_email_error: null })
            .eq("id", diagnosticId);
        } catch (emailError) {
          const customerEmailError = emailError instanceof Error ? emailError.message : "Erreur email client après paiement";
          console.error("[SANISPA email client] erreur après paiement", { diagnosticId, error: customerEmailError });
          await supabase
            .from("diagnostics")
            .update({ customer_email_status: "error", customer_email_error: customerEmailError })
            .eq("id", diagnosticId);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook invalide";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function loadDiagnosticEmailPayload(supabase: any, diagnosticId: string, origin: string) {
  const { data, error } = await supabase
    .from("diagnostics")
    .select(`
      id,
      status,
      problem_type,
      choice,
      payment_plan,
      payment_status,
      customers (
        name,
        phone,
        email,
        address,
        spa_brand,
        spa_model,
        spa_year
      ),
      diagnostic_answers (
        question_label,
        answer
      ),
      diagnostic_photos (
        photo_type,
        public_url
      ),
      payments (
        amount,
        status,
        plan
      )
    `)
    .eq("id", diagnosticId)
    .single();

  if (error) throw error;

  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const paidPayment = payments.find((payment: any) => payment.status === "paid") ?? payments[0];

  return {
    diagnosticId: data.id,
    customer: {
      name: customer?.name || "Client SANISPA",
      phone: customer?.phone || "",
      email: customer?.email || "",
      address: customer?.address || "",
      spaBrand: customer?.spa_brand || "Non renseignée",
      spaModel: customer?.spa_model || null,
      spaYear: customer?.spa_year || ""
    },
    problemType: data.problem_type,
    choice: data.choice || "",
    paymentPlan: data.payment_plan,
    amountPaid: paidPayment?.amount ? paidPayment.amount / 100 : null,
    status: data.payment_status === "paid" ? "Paiement validé" : data.status,
    appUrl: origin,
    dossierUrl: `${origin}/espace-client`,
    summaryPdfUrl: `${origin}/espace-client`,
    answers: data.diagnostic_answers ?? [],
    photos: data.diagnostic_photos ?? []
  };
}
