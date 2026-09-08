import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyWaterPayment } from "@/lib/payments";
import { processNotifications } from "@/lib/notifications";
export async function POST(request: Request) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = request.headers.get("stripe-signature");
    if (!secret || !signature)
        return NextResponse.json({ error: "Webhook indisponible" }, { status: 400 });
    let event;
    try {
        event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
    }
    catch {
        return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }
    try {
        const supabase = getSupabaseAdmin();
        if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
            const session = event.data.object;
            if (session.payment_status !== "paid")
                return NextResponse.json({ received: true });
            if (session.metadata?.type === "partner_lead_unlock") {
                const { error } = await supabase.rpc("apply_partner_payment", { p_session: session.id, p_purchase: session.metadata.lead_purchase_id, p_partner: session.metadata.partner_id, p_diagnostic: session.metadata.diagnostic_id, p_intent: String(session.payment_intent || ""), p_paid_at: new Date(event.created * 1000).toISOString() });
                if (error)
                    throw error;
            }
            else if (session.metadata?.water_assistance_session_id) {
                await applyWaterPayment(session, event.id, event.created);
                try {
                    await processNotifications("water:");
                }
                catch {
                    console.error("Notification paiement à relancer");
                }
            }
        }
        if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
            const session = event.data.object;
            if (session.metadata?.type === "partner_lead_unlock")
                await handlePartnerLeadUnlockNotPaid(session, event.type === "checkout.session.expired" ? "expired" : "failed");
            else {
                const { error } = await supabase.from("water_assistance_sessions").update({ status: "expired" }).eq("stripe_checkout_session_id", session.id).eq("status", "pending");
                if (error)
                    throw error;
            }
        }
        if (event.type === "charge.refunded" && event.data.object.refunded) {
            const intent = String(event.data.object.payment_intent || "");
            const { error } = await supabase.from("water_assistance_sessions").update({ status: "refunded" }).eq("stripe_payment_intent_id", intent);
            if (error)
                throw error;
            const result = await supabase.from("payments").update({ status: "refunded" }).eq("stripe_payment_intent_id", intent).select("diagnostic_id");
            if (result.error)
                throw result.error;
            for (const p of result.data || []) {
                const { error } = await supabase.from("diagnostics").update({ payment_status: "refunded" }).eq("id", p.diagnostic_id);
                if (error)
                    throw error;
            }
        }
        return NextResponse.json({ received: true });
    }
    catch {
        console.error("Traitement Stripe à relancer");
        return NextResponse.json({ error: "Traitement à réessayer" }, { status: 500 });
    }
}
async function handlePartnerLeadUnlockNotPaid(session: any, status: "expired" | "failed") {
    const diagnosticId = session.metadata?.diagnostic_id;
    const partnerId = session.metadata?.partner_id;
    const leadPurchaseId = session.metadata?.lead_purchase_id;
    if (!diagnosticId || !partnerId || !leadPurchaseId)
        return;
    const supabase = getSupabaseAdmin();
    const { data: purchase } = await supabase
        .from("lead_purchases")
        .select("status, locked_until")
        .eq("id", leadPurchaseId)
        .eq("request_id", diagnosticId)
        .eq("partner_id", partnerId)
        .maybeSingle();
    if (!purchase || purchase.status === "paid")
        return;
    await supabase
        .from("lead_purchases")
        .update({ status, locked_until: null })
        .eq("id", leadPurchaseId)
        .neq("status", "paid");
    const { data: paidPurchase } = await supabase
        .from("lead_purchases")
        .select("id")
        .eq("request_id", diagnosticId)
        .eq("status", "paid")
        .maybeSingle();
    if (!paidPurchase && purchase.locked_until) {
        await supabase
            .from("diagnostics")
            .update({ lead_locked_until: null })
            .eq("id", diagnosticId)
            .is("assigned_partner_id", null)
            .eq("lead_locked_until", purchase.locked_until);
    }
    console.log("[SANISPA Stripe partenaire] lead libéré après session non payée", {
        diagnosticId,
        partnerId,
        leadPurchaseId,
        status,
        stripeSessionId: session.id
    });
}
