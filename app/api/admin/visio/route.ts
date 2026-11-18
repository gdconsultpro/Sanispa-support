import { NextResponse } from "next/server";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/client-auth";
import { apiError, readJson } from "@/lib/http";
import { videoError, videoManagementSchema, videoSession } from "@/lib/video-assistance";
import { processNotifications } from "@/lib/notifications";
export async function GET(request: Request) {
  try {
    const { supabase } = await administrator(request.headers);
    const { data, error } = await supabase.from("video_assistance_sessions").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ sessions: (data || []).map(row => videoSession(row, true)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { supabase, user } = await administrator(request.headers);
    await rateLimit(supabase, `admin-visio:${user.id}`, 30);
    const payload = videoManagementSchema.parse(await readJson(request, 4000));
    const { data, error } = await supabase.rpc("manage_video_assistance", { p_id: payload.id, p_actor: user.id, p_version: payload.version,
      p_action: payload.action, p_starts_at: payload.action === "schedule" ? payload.startsAt : null, p_meeting_url: payload.action === "schedule" ? payload.meetingUrl : null });
    if (error) videoError(error);
    try { await processNotifications(`visio-update:${data.id}:${data.version}`); }
    catch { console.error("Notification de rendez-vous à relancer"); }
    return NextResponse.json({ session: videoSession(data, true) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
