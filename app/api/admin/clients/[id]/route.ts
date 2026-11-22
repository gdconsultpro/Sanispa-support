import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, HttpError, readJson } from "@/lib/http";

const input = z.object({ action: z.enum(["block", "unblock", "delete"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await administrator(request.headers);
    requireSameOrigin(request);
    const id = z.string().uuid().parse((await params).id);
    const { action } = input.parse(await readJson(request, 500));
    const { error } = await supabase.rpc("manage_admin_customer_account", {
      p_actor: user.id, p_user: id, p_action: action,
    });
    if (error?.message === "ACCOUNT_SHARED")
      throw new HttpError(409, "Ce compte possède aussi un accès administrateur ou partenaire.");
    if (error?.message === "ACCOUNT_NOT_FOUND")
      throw new HttpError(404, "Compte client introuvable.");
    if (error?.message === "ACCOUNT_HAS_HISTORY" || error?.code === "23503")
      throw new HttpError(409, "Ce compte est lié à des données à conserver. Vous pouvez le bloquer.");
    if (error?.message === "ADMIN_REQUIRED")
      throw new HttpError(403, "Accès administrateur requis.");
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
