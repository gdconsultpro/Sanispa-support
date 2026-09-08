import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/client-auth";
import { readJson, apiError, HttpError } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { remotePlans } from "@/lib/questions";
import { applyWaterPayment } from "@/lib/payments";
export async function POST(request: Request) {
    try {
        const { user, supabase } = await requireUser(request);
        await rateLimit(supabase, `checkout:${user.id}`, 10);
        const payload = z.object({ diagnosticId: z.string().uuid(), paymentPlan: z.literal("water") }).parse(await readJson(request, 1000));
        const plan = remotePlans.find(p => p.id === "water" && p.enabled);
        const price = plan && process.env[plan.stripeEnv];
        if (!price)
            throw new HttpError(503, "Le paiement est momentanément indisponible.");
        const stripe = getStripe();
        const prepare = async () => { const { data, error } = await supabase.rpc("prepare_water_checkout", { p_id: payload.diagnosticId, p_user: user.id }); if (error?.message.includes("NOT_FOUND"))
            throw new HttpError(404, "Dossier introuvable."); if (error)
            throw error; return data; };
        let water = await prepare();
        const origin = process.env.NEXT_PUBLIC_APP_URL;
        if (!origin)
            throw new Error("Application URL missing");
        const resume = (token: string) => `${origin}/assistant-eau?token=${token}`;
        if (water.status === "paid")
            return NextResponse.json({ url: resume(water.resume_token), paid: true });
        if (water.stripe_checkout_session_id) {
            const previous = await stripe.checkout.sessions.retrieve(water.stripe_checkout_session_id);
            if (previous.payment_status === "paid") {
                await applyWaterPayment(previous, `reconcile:${previous.id}`, previous.created);
                return NextResponse.json({ url: resume(water.resume_token), paid: true });
            }
            if (previous.status === "open" && previous.url)
                return NextResponse.json({ url: previous.url });
            if (previous.status === "complete")
                throw new HttpError(409, "Votre paiement est en cours de confirmation. Revenez dans quelques instants.");
            const { error } = await supabase.from("water_assistance_sessions").update({ status: "expired" }).eq("id", water.id).eq("status", "pending");
            if (error)
                throw error;
            water = await prepare();
        }
        const session = await stripe.checkout.sessions.create({ mode: "payment", customer_email: user.email, line_items: [{ price, quantity: 1 }], success_url: `${resume(water.resume_token)}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/paiement?diagnosticId=${payload.diagnosticId}`, metadata: { diagnostic_id: payload.diagnosticId, payment_plan: "water", water_assistance_session_id: water.id, resume_token: water.resume_token } }, { idempotencyKey: `water-checkout:${water.id}` });
        const { error } = await supabase.from("water_assistance_sessions").update({ stripe_checkout_session_id: session.id }).eq("id", water.id);
        if (error)
            throw error;
        return NextResponse.json({ url: session.url });
    }
    catch (e) {
        return apiError(e);
    }
}
