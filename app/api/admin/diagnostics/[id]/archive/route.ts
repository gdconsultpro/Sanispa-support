import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, HttpError, readJson } from "@/lib/http";

const archiveInput = z.object({ archived: z.boolean() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await administrator(request.headers);
    requireSameOrigin(request);
    const id = z.string().uuid().parse((await params).id);
    const { archived } = archiveInput.parse(await readJson(request, 1024));
    const { data, error } = await supabase.from("diagnostics")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Ce dossier est introuvable.");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
