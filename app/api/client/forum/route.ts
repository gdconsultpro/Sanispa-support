import { NextResponse } from "next/server";
import { requireForumClient, forumPostSchema, detectsSolicitation } from "@/lib/premium-forum";
import { rateLimit } from "@/lib/client-auth";
import { apiError, readJson } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireForumClient(request);
    const result = await supabase.from("forum_posts").select("id,user_id,parent_id,title,body,state,created_at").or(`state.eq.approved,user_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(200);
    if (result.error) throw result.error;
    return NextResponse.json({ posts: (result.data || []).map(p => ({ id: p.id, parentId: p.parent_id, title: p.title, body: p.body, state: p.state, createdAt: p.created_at, own: p.user_id === user.id, author: `Membre ${p.user_id.slice(-6).toUpperCase()}` })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireForumClient(request);
    await rateLimit(supabase, `forum:${user.id}`, 10, 3600);
    const p = forumPostSchema.parse(await readJson(request, 5000));
    const result = await supabase.from("forum_posts").insert({ user_id: user.id, parent_id: p.parentId, title: p.parentId ? "" : p.title, body: p.body, state: "pending", solicitation_flag: detectsSolicitation(`${p.title}\n${p.body}`) });
    if (result.error) throw result.error;
    return NextResponse.json({ submitted: true });
  } catch (e) { return apiError(e); }
}
