import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator } from "@/lib/admin-auth";
import { apiError, HttpError } from "@/lib/http";
import { prepareSynchroteamDraft } from "@/lib/synchroteam-draft";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await administrator(request.headers);
    const id = z.string().uuid().parse((await params).id);
    const { data, error } = await supabase.from("diagnostics").select("id,user_id,customer_id,problem_type,request_type,customers(name,email,phone,address),diagnostic_answers(question_label,answer)").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Dossier introuvable.");
    return new NextResponse(JSON.stringify(prepareSynchroteamDraft(data), null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="preparation-synchroteam-${id}.json"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return apiError(e); }
}
