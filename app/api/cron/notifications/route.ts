import { NextResponse } from "next/server";
import { processNotifications } from "@/lib/notifications";
import { apiError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";
export async function GET(request: Request) { if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Accès refusé" }, { status: 401 }); try {
    const supabase = getSupabaseAdmin();
    const queued = await supabase.rpc("queue_client_review_reminders");
    if (queued.error) throw queued.error;
    const care = await supabase.rpc("queue_premium_care_reminders");
    if (care.error) throw care.error;
    const notifications = await processNotifications();
    const expired = await supabase.from("client_signup_drafts").delete().lt("expires_at", new Date().toISOString());
    if (expired.error) console.error("Impossible de nettoyer les brouillons d’inscription expirés.");
    return NextResponse.json(notifications);
}
catch (e) {
    return apiError(e);
} }
