import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDenied } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiError, readJson } from "@/lib/http";
export async function PATCH(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { const denied = adminDenied(request); if (denied)
    return denied; try {
    const { id } = await params;
    const p = z.object({ status: z.enum(["en analyse", "devis envoyé", "RDV demandé", "terminé", "CLOSED"]), notes: z.string().max(10000), next: z.string().datetime().nullable() }).parse(await readJson(request, 15000));
    const { error } = await getSupabaseAdmin().rpc("update_sav", { p_id: id, p_status: p.status, p_notes: p.notes, p_next: p.next, p_actor: process.env.ADMIN_USERNAME });
    if (error)
        throw error;
    return NextResponse.json({ ok: true });
}
catch (e) {
    return apiError(e);
} }
