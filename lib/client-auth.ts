import { getSupabaseAdmin } from "@/lib/supabase";

export async function getAuthenticatedUser(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return { user: null, supabase: getSupabaseAdmin() };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, supabase };
  }

  return { user: data.user, supabase };
}
