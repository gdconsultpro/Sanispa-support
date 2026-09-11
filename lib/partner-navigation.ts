/** Only known partner screens may be used as post-authentication destinations. */
export function partnerReturnPath(value: string | null | undefined) {
  return value && /^\/partenaire(?:\/leads(?:\/[a-f0-9-]{36})?)?$/i.test(value) ? value : "/partenaire/leads";
}
export function partnerLoginPath(next?: string | null) {
  return `/partenaire/connexion?next=${encodeURIComponent(partnerReturnPath(next))}`;
}
export function partnerPasswordPath(next?: string | null) {
  return `/partenaire/mot-de-passe?next=${encodeURIComponent(partnerReturnPath(next))}`;
}
export function needsPartnerPasswordChange(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.partner_password_change_required === true;
}
export async function withPartnerTimeout<T>(operation: Promise<T>, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Le service met trop de temps à répondre. Vérifiez votre connexion puis réessayez.")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
