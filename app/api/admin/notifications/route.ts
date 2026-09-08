import { NextResponse } from "next/server";
import { adminDenied } from "@/lib/admin-auth";
import { processNotifications } from "@/lib/notifications";
import { apiError } from "@/lib/http";
export async function POST(request: Request) { const denied = adminDenied(request); if (denied)
    return denied; try {
    return NextResponse.json(await processNotifications());
}
catch (e) {
    return apiError(e);
} }
