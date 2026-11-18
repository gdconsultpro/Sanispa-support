import { NextResponse } from "next/server";
import { processNotifications } from "@/lib/notifications";
import { apiError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";
export async function GET(request: Request) { if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Accès refusé" }, { status: 401 }); try {
    const queued = await getSupabaseAdmin().rpc("queue_client_review_reminders");
    if (queued.error) throw queued.error;
    const care = await getSupabaseAdmin().rpc("queue_premium_care_reminders");
    if (care.error) throw care.error;
    return NextResponse.json(await processNotifications());
}
catch (e) {
    return apiError(e);
} }
