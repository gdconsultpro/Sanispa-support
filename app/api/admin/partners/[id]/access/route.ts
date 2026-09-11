import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, readJson } from "@/lib/http";
import { createPartnerAccess, partnerAccessSchema } from "@/lib/partner-access";
import { needsPartnerPasswordChange } from "@/lib/partner-navigation";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const { supabase } = await administrator(request.headers);
    const id = z.string().uuid().parse((await params).id);
    const { data, error } = await supabase.from("partner_users").select("user_id,active,contact_name,created_at").eq("partner_id", id);
    if (error) throw error;
    const accesses = await Promise.all((data ?? []).map(async link => {
      const result = await supabase.auth.admin.getUserById(link.user_id);
      if (result.error || !result.data.user) throw new Error("Account lookup failed");
      const user = result.data.user;
      return { ...link, email: user.email, passwordChangeRequired: needsPartnerPasswordChange(user) };
    }));
    return NextResponse.json({ accesses }, { headers });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const { supabase, user } = await administrator(request.headers);
    requireSameOrigin(request);
    const id = z.string().uuid().parse((await params).id);
    const input = partnerAccessSchema.parse(await readJson(request, 4096));
    const result = await createPartnerAccess(supabase, id, user.id, input);
    return NextResponse.json(result, { status: "conflict" in result ? 409 : 200, headers });
  } catch (error) { return apiError(error); }
}
