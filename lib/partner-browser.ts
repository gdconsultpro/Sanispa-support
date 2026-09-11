"use client";
import { getSupabaseBrowser } from "./supabase-browser";
import { partnerLoginPath, partnerPasswordPath, withPartnerTimeout } from "./partner-navigation";

export async function partnerToken(next: string) {
  const { data, error } = await withPartnerTimeout(getSupabaseBrowser().auth.getSession());
  if (error) throw new Error("Votre session n’a pas pu être vérifiée. Reconnectez-vous.");
  if (!data.session) { window.location.replace(partnerLoginPath(next)); return null; }
  return data.session.access_token;
}
export function redirectPartnerAccess(response: Response, next: string) {
  if (response.status === 401 || response.status === 428) {
    window.location.replace(response.status === 428 ? partnerPasswordPath(next) : partnerLoginPath(next));
    return true;
  }
  return false;
}
export async function loadPartnerSession(token: string) {
  const response = await fetch("/api/partner/session", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Votre accès partenaire n’a pas pu être vérifié. Réessayez.");
  if (!body?.partner?.id || typeof body.passwordChangeRequired !== "boolean")
    throw new Error("La réponse du serveur ne confirme pas votre accès partenaire. Réessayez.");
  return body as { partner: { id: string; company_name: string }; passwordChangeRequired: boolean };
}
export function partnerAuthError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "invalid_credentials") return "Adresse e-mail ou mot de passe incorrect. Vérifiez votre saisie ou utilisez « Mot de passe oublié » si ce compte existe déjà.";
  if (code === "email_not_confirmed") return "Cette adresse n’est pas encore confirmée. Consultez votre e-mail de confirmation ou contactez SANISPA.";
  if (code === "user_banned") return "Ce compte est désactivé. Contactez SANISPA pour vérifier votre accès.";
  if (code === "same_password") return "Choisissez un mot de passe différent du mot de passe provisoire ou actuel.";
  if (code === "weak_password") return "Ce mot de passe est trop faible. Choisissez au moins 12 caractères et évitez un mot de passe déjà utilisé.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Trop de tentatives rapprochées. Patientez avant de réessayer.";
  if (code === "reauthentication_needed" || code === "session_not_found") return "Reconnectez-vous, puis recommencez le changement de mot de passe.";
  if (error instanceof Error && error.name === "Error") return error.message;
  return "Le service de connexion ne répond pas. Vérifiez votre connexion, puis réessayez.";
}
