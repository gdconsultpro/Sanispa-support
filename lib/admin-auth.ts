import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import { verifySessionToken } from "./session-auth";
import { apiError, HttpError } from "./http";

export const adminCookieName = process.env.NODE_ENV === "production" ? "__Host-sanispa-admin" : "sanispa-admin";

export function adminToken(headers: Headers) {
  const bearer = headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (bearer) return bearer;
  return headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${adminCookieName}=`))?.slice(adminCookieName.length + 1) ?? null;
}

export async function administrator(headers: Headers, requireMfa = true) {
  const token = adminToken(headers);
  if (!token) throw new HttpError(401, "Connectez-vous à votre compte administrateur.");
  const supabase = getSupabaseAdmin();
  const session = await verifySessionToken(token, supabase);
  if (!session) throw new HttpError(401, "Votre session a expiré. Reconnectez-vous.");
  if (!session.isAdmin) throw new HttpError(403, "Ce compte ne dispose pas d’un accès administrateur.");
  if (requireMfa && (session.claims.aal !== "aal2" || !session.mfaVerified))
    throw new HttpError(403, "Validez le code de votre application d’authentification.");
  return { ...session, token, supabase };
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(request.url).origin, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean));
  if (!origin || !allowed.has(origin) || request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Origine de la requête refusée.");
}

export async function adminDenied(request: Request) {
  try {
    await administrator(request.headers);
    if (!["GET", "HEAD"].includes(request.method)) requireSameOrigin(request);
    return null;
  } catch (error) { return apiError(error); }
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(adminCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
