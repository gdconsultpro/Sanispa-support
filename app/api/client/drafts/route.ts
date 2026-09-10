import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/client-auth";
import { draftSchema, draftSteps } from "@/lib/draft-schema";
import { apiError, HttpError, readJson } from "@/lib/http";
export async function GET(request: Request) {
    try {
        const { user, supabase } = await requireUser(request);
        const id = new URL(request.url).searchParams.get("id");
        if (id) {
            z.string().uuid().parse(id);
            const { data, error } = await supabase.from("diagnostic_drafts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
            if (error)
                throw error;
            if (!data)
                throw new HttpError(404, "Brouillon introuvable.");
            return NextResponse.json({ draft: data });
        }
        const { data, error } = await supabase.from("diagnostic_drafts").select("id,step,updated_at,version").eq("user_id", user.id).is("submitted_at", null).order("updated_at", { ascending: false }).limit(50);
        if (error)
            throw error;
        return NextResponse.json({ drafts: data });
    }
    catch (e) {
        return apiError(e);
    }
}
export async function PUT(request: Request) {
    try {
        const { user, supabase } = await requireUser(request);
        await rateLimit(supabase, `draft:${user.id}`, 60);
        const input = z.object({ id: z.string().uuid(), version: z.number().int().min(0), step: z.enum(draftSteps), payload: draftSchema }).parse(await readJson(request));
        input.payload.email = user.email!.toLowerCase();
        if (input.payload.spaId) {
            const { data, error } = await supabase.from("customer_spas").select("id").eq("id", input.payload.spaId).eq("user_id", user.id).maybeSingle();
            if (error)
                throw error;
            if (!data)
                throw new HttpError(403, "Spa introuvable.");
        }
        const { data, error } = await supabase.rpc("save_diagnostic_draft", { p_id: input.id, p_user: user.id, p_version: input.version, p_step: input.step, p_payload: input.payload });
        if (error?.message.includes("DRAFT_CONFLICT"))
            throw new HttpError(409, "Ce diagnostic a changé sur un autre appareil. Reprenez-le depuis votre espace client.");
        if (error)
            throw error;
        return NextResponse.json({ draft: data });
    }
    catch (e) {
        return apiError(e);
    }
}
