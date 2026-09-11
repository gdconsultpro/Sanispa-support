import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/client-auth";
import { apiError, readJson, HttpError } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { applyWaterPayment } from "@/lib/payments";
export async function POST(request: Request) {
    try {
        const payload = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/).optional(), diagnosticId: z.string().uuid().optional(), stripeSessionId: z.string().max(200).optional() }).parse(await readJson(request, 2000));
        const { user, supabase } = await requireUser(request);
        let query = supabase.from("water_assistance_sessions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
        if (payload.token)
            query = query.eq("resume_token", payload.token);
        else {
            query = query.eq("user_id", user.id).eq("status", "paid").gt("expires_at", new Date().toISOString());
        }
        if (payload.diagnosticId) query = query.eq("diagnostic_id", payload.diagnosticId);
        let { data: session, error } = await query.maybeSingle();
        if (error)
            throw error;
        if (session && payload.stripeSessionId && session.status !== "paid") {
            const paid = await getStripe().checkout.sessions.retrieve(payload.stripeSessionId);
            if (paid.metadata?.water_assistance_session_id !== session.id)
                throw new HttpError(403, "Paiement invalide.");
            if (paid.payment_status === "paid")
                await applyWaterPayment(paid, `reconcile:${paid.id}`, paid.created);
            const refreshed = await supabase.from("water_assistance_sessions").select("*").eq("id", session.id).eq("user_id", user.id).single();
            if (refreshed.error)
                throw refreshed.error;
            session = refreshed.data;
        }
        if (!session || session.status !== "paid" || !session.expires_at || new Date(session.expires_at) <= new Date())
            return NextResponse.json({ active: false });
        const messages = await supabase.from("water_assistance_messages").select("role,content").eq("session_id", session.id).order("created_at", { ascending: false }).limit(100);
        if (messages.error)
            throw messages.error;
        const answers = await supabase.from("diagnostic_answers").select("question_key,question_label,answer").eq("diagnostic_id", session.diagnostic_id);
        if (answers.error)
            throw answers.error;
        return NextResponse.json({ active: true, token: session.resume_token, expiresAt: session.expires_at, resumeUrl: `/assistant-eau?token=${session.resume_token}`, messages: (messages.data || []).reverse(), answerRows: answers.data || [], answers: Object.fromEntries((answers.data || []).map(a => [a.question_key, a.answer])) });
    }
    catch (e) {
        return apiError(e);
    }
}
