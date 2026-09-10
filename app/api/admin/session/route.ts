import { NextResponse } from "next/server";
import { administrator, adminCookieName, clearAdminCookie, requireSameOrigin } from "@/lib/admin-auth";
import { apiError } from "@/lib/http";
import { verifySessionToken } from "@/lib/session-auth";

export async function GET(request: Request) {
  try {
    const session = await administrator(request.headers, false);
    return NextResponse.json({ email: session.user.email, mfaRequired: session.claims.aal !== "aal2" || !session.mfaVerified });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await administrator(request.headers);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminCookieName, session.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/",
      maxAge: Math.max(0, Math.min(3600, Math.floor(session.claims.exp! - Date.now() / 1000)))
    });
    return response;
  } catch (error) { return clearAdminCookie(apiError(error)); }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    // Revoking the underlying session also invalidates copies of the cookie immediately.
    const session = await administrator(request.headers, false);
    const { error } = await session.supabase.auth.admin.signOut(session.token, "local");
    if (error) throw error;
    return clearAdminCookie(NextResponse.json({ ok: true }));
  } catch (error) { return clearAdminCookie(apiError(error)); }
}

/** Keep the separate HttpOnly administrator cookie bound to the browser's current session. */
export async function PATCH(request: Request) {
  try { requireSameOrigin(request); } catch (error) { return apiError(error); }
  try {
    const cookie = request.headers.get("cookie");
    if (!cookie?.split(";").some(value => value.trim().startsWith(`${adminCookieName}=`)))
      return NextResponse.json({ ok: true });
    const previous = await administrator(new Headers({ cookie }), false);
    const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    const current = token ? await verifySessionToken(token, previous.supabase) : null;
    if (current?.user.id === previous.user.id && current.claims.session_id === previous.claims.session_id &&
        current.isAdmin && current.mfaVerified && current.claims.aal === "aal2")
      return NextResponse.json({ ok: true });
    const { error } = await previous.supabase.auth.admin.signOut(previous.token, "local");
    if (error) throw error;
    return clearAdminCookie(NextResponse.json({ ok: true, adminCleared: true }));
  } catch (error) {
    const response = apiError(error);
    // An absent, expired or revoked administrator session only requires clearing its cookie.
    if (response.status === 401 || response.status === 403) return clearAdminCookie(NextResponse.json({ ok: true, adminCleared: true }));
    return clearAdminCookie(response);
  }
}
