import { NextResponse } from "next/server";
import { processNotifications } from "@/lib/notifications";
import { apiError } from "@/lib/http";
export async function GET(request: Request) { if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Accès refusé" }, { status: 401 }); try {
    return NextResponse.json(await processNotifications());
}
catch (e) {
    return apiError(e);
} }
