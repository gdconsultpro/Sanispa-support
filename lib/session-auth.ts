import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http";

/** Only use claims after Supabase has verified this exact token and its owner. */
export async function verifySessionToken(token: string, supabase: SupabaseClient) {
  if (token.length > 8192) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) return null;
  let claims: { sub?: string; session_id?: string; exp?: number; aal?: string; role?: string };
  try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
  catch { return null; }
  if (claims.sub !== data.user.id || claims.role !== "authenticated" || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000 || !claims.session_id?.match(/^[a-f0-9-]{36}$/i)) return null;
  const { data: state, error: stateError } = await supabase.rpc("private_session_status", { p_user: data.user.id, p_session: claims.session_id });
  if (stateError) throw new HttpError(503, "Vérification de session indisponible. Réessayez dans un instant.");
  if (!state?.active) return null;
  return { user: data.user, claims, isAdmin: state.is_admin === true, mfaVerified: state.mfa_verified === true };
}
