import { NextResponse } from "next/server";
import { administrator, adminCookieName, clearAdminCookie, requireSameOrigin } from "@/lib/admin-auth";
import { apiError } from "@/lib/http";

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
