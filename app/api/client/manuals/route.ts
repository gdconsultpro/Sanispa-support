import { NextResponse } from "next/server";
import { requirePremium } from "@/lib/customer-premium";
import { apiError } from "@/lib/http";
import { frenchSpaManuals } from "@/lib/spa-manuals";
export async function GET(request: Request) {
  try {
    const { supabase } = await requirePremium(request);
    const manuals = await frenchSpaManuals(supabase);
    return NextResponse.json({ manuals }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
