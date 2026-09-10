import type Stripe from "stripe";
import { getSupabaseAdmin } from "./supabase";
export async function applyWaterPayment(session: Stripe.Checkout.Session, eventId: string, paidAtSeconds: number) {
    if (session.payment_status !== "paid")
        return false;
    const diagnosticId = session.metadata?.diagnostic_id;
    const waterId = session.metadata?.water_assistance_session_id;
    if (!diagnosticId || !waterId)
        throw new Error("Missing payment metadata");
    const supabase = getSupabaseAdmin();
    const { data: w, error } = await supabase.from("water_assistance_sessions").select("*").eq("id", waterId).eq("diagnostic_id", diagnosticId).single();
    if (error)
        throw error;
    if (w.resume_token !== session.metadata?.resume_token)
        throw new Error("Payment mismatch");
    const days = Math.min(365, Math.max(1, Number(process.env.WATER_ASSISTANCE_DAYS) || 7));
    const paidAt = new Date(paidAtSeconds * 1000).toISOString();
    const expires = new Date(paidAtSeconds * 1000 + days * 86400000).toISOString();
    const { data, error: applyError } = await supabase.rpc("apply_water_payment", { p_event: eventId, p_session: session.id, p_water: waterId, p_diagnostic: diagnosticId, p_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "", p_amount: session.amount_total || 0, p_currency: session.currency || "eur", p_paid_at: paidAt, p_days: days, p_job: { to: w.customer_email, name: w.customer_name || "Client SANISPA", resumeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/espace-client`, expiresAt: expires } });
    if (applyError)
        throw applyError;
    return data;
}
