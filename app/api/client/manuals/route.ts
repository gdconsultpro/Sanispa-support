import { NextResponse } from "next/server";
import { requirePremium } from "@/lib/customer-premium";
import { apiError } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const { supabase } = await requirePremium(request);
    const r = await supabase.from("spa_manuals").select("id,brand,model,title,source_url,source_kind,language,verified_at").eq("active", true).eq("language", "fr").order("brand").limit(300);
    if (r.error) throw r.error;
    return NextResponse.json({ manuals: r.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
