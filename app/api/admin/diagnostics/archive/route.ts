import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, HttpError, readJson } from "@/lib/http";

const selection = z.object({ ids: z.array(z.string().uuid()).min(1) }).strict();

export async function POST(request: Request) {
  try {
    const { user, supabase } = await administrator(request.headers);
    requireSameOrigin(request);
    const { ids } = selection.parse(await readJson(request));
    const { data, error } = await supabase.rpc("archive_admin_diagnostics", { p_actor: user.id, p_ids: [...new Set(ids)] });
    if (error?.message.includes("ADMIN_REQUIRED")) throw new HttpError(403, "Ce compte ne dispose plus d’un accès administrateur.");
    if (error) throw error;
    return NextResponse.json({ archived: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
