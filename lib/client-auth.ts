import { getSupabaseAdmin } from "@/lib/supabase";
import { HttpError } from "./http";
export async function getAuthenticatedUser(request: Request) {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    const supabase = getSupabaseAdmin();
    if (!token)
        return { user: null, supabase };
    const { data, error } = await supabase.auth.getUser(token);
    const user = !error && data.user?.email_confirmed_at ? data.user : null;
    return { user, supabase };
}
export async function requireUser(request: Request) {
    const context = await getAuthenticatedUser(request);
    if (!context.user?.email)
        throw new HttpError(401, "Reconnectez-vous pour retrouver votre diagnostic.");
    return { ...context, user: context.user };
}
export async function ownsDiagnostic(supabase: ReturnType<typeof getSupabaseAdmin>, id: string, userId: string) {
    const { data, error } = await supabase.from("diagnostics").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error)
        throw error;
    return Boolean(data);
}
export async function rateLimit(supabase: ReturnType<typeof getSupabaseAdmin>, key: string, limit: number, seconds = 60) {
    const { data, error } = await supabase.rpc("consume_request_limit", { p_key: key, p_limit: limit, p_seconds: seconds });
    if (error)
        throw error;
    if (!data)
        throw new HttpError(429, "Trop de demandes. Réessayez dans une minute.");
}
