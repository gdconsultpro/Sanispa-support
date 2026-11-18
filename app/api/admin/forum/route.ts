import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const { user, supabase } = await administrator(request.headers); requireSameOrigin(request);
    const p = z.object({ id: z.string().uuid(), state: z.enum(["approved", "rejected"]) }).strict().parse(await readJson(request, 1000));
    const post = await supabase.from("forum_posts").select("id,parent_id").eq("id", p.id).maybeSingle();
    if (post.error) throw post.error;
    if (!post.data) throw new HttpError(404, "Message introuvable.");
    if (p.state === "approved" && post.data.parent_id) {
      const parent = await supabase.from("forum_posts").select("id").eq("id", post.data.parent_id).eq("state", "approved").maybeSingle();
      if (parent.error) throw parent.error;
      if (!parent.data) throw new HttpError(409, "La discussion doit être publiée avant sa réponse.");
    }
    const saved = await supabase.from("forum_posts").update({ state: p.state, moderated_by: user.id, moderated_at: new Date().toISOString() }).eq("id", p.id);
    if (saved.error) throw saved.error;
    return NextResponse.json({ saved: true });
  } catch (e) { return apiError(e); }
}
