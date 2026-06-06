import { NextResponse } from "next/server";
import { z } from "zod";
import { sendWaterAssistanceResumeLink } from "@/lib/email";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

const sessionSchema = z.object({
  token: z.string().optional(),
  email: z.string().email().optional(),
  diagnosticId: z.string().uuid().optional(),
  stripeSessionId: z.string().optional()
});

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function isActive(session: { status: string; expires_at: string | null }) {
  return session.status === "paid" && Boolean(session.expires_at) && new Date(session.expires_at as string) > new Date();
}

export async function POST(request: Request) {
  try {
    const payload = sessionSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const validityDays = Number(process.env.WATER_ASSISTANCE_DAYS ?? "7");

    let query = supabase
      .from("water_assistance_sessions")
      .select("id, diagnostic_id, customer_email, customer_name, status, resume_token, current_step, expires_at, stripe_checkout_session_id, paid_at")
      .order("created_at", { ascending: false })
      .limit(1);

    if (payload.token) {
      query = query.eq("resume_token", payload.token);
    } else if (payload.diagnosticId) {
      query = query.eq("diagnostic_id", payload.diagnosticId).eq("status", "paid").gt("expires_at", new Date().toISOString());
    } else if (payload.email) {
      query = query.eq("customer_email", payload.email.toLowerCase()).eq("status", "paid").gt("expires_at", new Date().toISOString());
    } else {
      return NextResponse.json({ active: false });
    }

    let { data: session, error } = await query.maybeSingle();
    if (error) throw error;

    if (session && payload.stripeSessionId && session.status !== "paid") {
      const stripe = getStripe();
      const stripeSession = await stripe.checkout.sessions.retrieve(payload.stripeSessionId);
      if (stripeSession.payment_status === "paid" && stripeSession.metadata?.resume_token === session.resume_token) {
        const paidExpiresAt = addDays(validityDays);
        const { data: updated, error: updateError } = await supabase
          .from("water_assistance_sessions")
          .update({
            status: "paid",
            current_step: "assistant",
            paid_at: new Date().toISOString(),
            expires_at: paidExpiresAt,
            stripe_payment_intent_id: String(stripeSession.payment_intent ?? ""),
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString()
          })
          .eq("id", session.id)
          .select("id, diagnostic_id, customer_email, customer_name, status, resume_token, current_step, expires_at, stripe_checkout_session_id, paid_at")
          .single();

        if (updateError) throw updateError;
        session = updated;

        await supabase
          .from("payments")
          .update({ status: "paid", stripe_payment_intent_id: String(stripeSession.payment_intent ?? "") })
          .eq("stripe_session_id", stripeSession.id);

        await supabase.from("diagnostics").update({ payment_status: "paid", status: "en analyse" }).eq("id", session.diagnostic_id);

        await sendWaterAssistanceResumeLink({
          to: session.customer_email,
          name: session.customer_name || "Client SANISPA",
          resumeUrl: `${origin}/assistant-eau?token=${session.resume_token}`,
          expiresAt: paidExpiresAt
        });
      }
    }

    if (!session || !isActive(session)) {
      return NextResponse.json({ active: false, status: session?.status ?? null });
    }

    await supabase
      .from("water_assistance_sessions")
      .update({ current_step: "assistant", last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", session.id);

    const { data: messages } = await supabase
      .from("water_assistance_messages")
      .select("role, content")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      active: true,
      token: session.resume_token,
      expiresAt: session.expires_at,
      resumeUrl: `${origin}/assistant-eau?token=${session.resume_token}`,
      messages: messages ?? []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
