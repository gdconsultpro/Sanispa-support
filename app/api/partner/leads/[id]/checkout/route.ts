import { processNotifications } from "@/lib/notifications";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartnerOwner } from "@/lib/partner-auth";
import { acquireOffer } from "@/lib/partner-offers";
import { apiError } from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { user, partner, supabase } = await requirePartnerOwner(request);
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      new URL(request.url).origin;
    // The browser cannot choose the billing mode, price, author or beneficiary.
    const result = await acquireOffer({
      supabase,
      partner,
      userId: user.id,
      diagnosticId: id,
      origin,
    });
    if ("acquired" in result) {
      try {
        await processNotifications("accepted:");
      } catch {
        console.error("Notification acceptation à relancer");
      }
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
