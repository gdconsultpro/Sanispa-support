"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { loadPartnerSession, partnerAuthError, partnerToken } from "@/lib/partner-browser";
import { partnerLoginPath, partnerReturnPath, withPartnerTimeout } from "@/lib/partner-navigation";
export default function PartnerPasswordPage() {
  const router = useRouter();
  const [required, setRequired] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const next = () => partnerReturnPath(new URLSearchParams(window.location.search).get("next"));
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { const token = await partnerToken(next()); if (!token) return;
        const session = await loadPartnerSession(token); if (!cancelled) setRequired(session.passwordChangeRequired);
      } catch (cause) { if (!cancelled) setError(partnerAuthError(cause)); }
    })();
    return () => { cancelled = true; };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (pending.current) return;
    setError("");
    if (password.length < 12 || password.length > 128) { setError("Choisissez un mot de passe de 12 à 128 caractères."); return; }
    if (password !== confirmation) { setError("Les deux mots de passe sont différents. Vérifiez la confirmation."); return; }
    pending.current = true; setSaving(true);
    try {
      const supabase = getSupabaseBrowser();
      const token = await partnerToken(next()); if (!token) return;
      await loadPartnerSession(token);
      const { error: changeError } = await withPartnerTimeout(supabase.auth.updateUser({ password }));
      if (changeError) throw changeError;
      const freshToken = await partnerToken(next()); if (!freshToken) return;
      const session = await loadPartnerSession(freshToken);
      if (session.passwordChangeRequired) throw new Error("Le changement a été reçu, mais l’accès aux dossiers reste bloqué. Contactez SANISPA pour vérifier votre compte.");
      setPassword(""); setConfirmation(""); setSaved(true);
      if (required) router.replace(next());
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { pending.current = false; setSaving(false); }
  }
  return <AppShell compact>
    <StepHeader eyebrow="Espace partenaire" title={required ? "Choisissez votre mot de passe personnel" : "Modifier mon mot de passe"} description={required ? "Votre mot de passe provisoire doit être remplacé avant de consulter les dossiers." : "Utilisez un mot de passe personnel que vous n’utilisez pas ailleurs."} />
    {required === null && !error ? <p role="status">Vérification de votre accès…</p> : null}
    {error ? <p role="alert" className="my-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error} <Link className="underline" href={partnerLoginPath()}>Revenir à la connexion</Link></p> : null}
    {saved ? <p role="status">Votre mot de passe a été modifié. <Link href="/partenaire/leads" className="underline">Accéder aux demandes</Link></p> : required !== null ? <form onSubmit={save} className="grid gap-4 rounded-md border border-sanispa-line bg-white p-5" aria-busy={saving}>
      <Field label="Nouveau mot de passe personnel (12 caractères minimum)" name="password" value={password} onChange={setPassword} type={show ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" />
      <Field label="Confirmer le nouveau mot de passe" name="confirmation" value={confirmation} onChange={setConfirmation} type={show ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Afficher les mots de passe</label>
      <Button type="submit" disabled={saving}>{saving ? "Modification en cours…" : "Enregistrer mon mot de passe"}</Button>
      {!required ? <Link className="underline" href="/partenaire">Retour à mon espace</Link> : null}
    </form> : null}
  </AppShell>;
}
