"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { useProfessionalAccount } from "@/components/ProfessionalAccountLink";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { loadPartnerSession, partnerAuthError } from "@/lib/partner-browser";
import { partnerLoginDestination, partnerPasswordPath, withPartnerTimeout } from "@/lib/partner-navigation";
export default function PartnerLoginPage() {
  const router = useRouter();
  const access = useProfessionalAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const navigating = useRef(false);
  const [resuming, setResuming] = useState(false);
  useEffect(() => {
    if (access.status !== "partner" || pending.current || navigating.current) return;
    const next = partnerLoginDestination(new URLSearchParams(window.location.search).get("next"), access.role);
    navigating.current = true;
    setResuming(true);
    router.replace(access.passwordChangeRequired ? partnerPasswordPath(next) : next);
  }, [access, router]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || navigating.current) return;
    const requested = new URLSearchParams(window.location.search).get("next");
    pending.current = true; setLoading(true); setError("");
    try {
      const { data, error: signInError } = await withPartnerTimeout(getSupabaseBrowser().auth.signInWithPassword({ email: email.trim(), password }));
      if (signInError) throw signInError;
      if (!data.session?.access_token) throw new Error("La connexion n’a pas ouvert de session. Réessayez.");
      const session = await loadPartnerSession(data.session.access_token);
      if (!session) return;
      const next = partnerLoginDestination(requested, session.partner.role);
      navigating.current = true;
      setResuming(true);
      router.replace(session.passwordChangeRequired ? partnerPasswordPath(next) : next);
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { pending.current = false; setLoading(false); }
  }
  return <AppShell compact>
    <StepHeader eyebrow="Espace partenaire" title="Connexion partenaire" description="Connectez-vous avec votre adresse e-mail et votre mot de passe pour retrouver votre espace professionnel gratuit." />
    {resuming || access.status === "checking" || access.status === "partner" && !loading ? <p role="status">Ouverture de votre espace partenaire…</p>
      : <form onSubmit={submit} className="grid gap-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft" aria-busy={loading}>
      <Field label="Adresse e-mail" type="email" name="email" value={email} onChange={setEmail} required autoComplete="username" />
      <Field label="Mot de passe" type="password" name="password" value={password} onChange={setPassword} required autoComplete="current-password" />
      {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <Button type="submit" disabled={loading}>{loading ? "Connexion…" : "Se connecter"}</Button>
      <Link className="focus-ring text-sm font-bold text-sanispa-blue underline" href="/mot-de-passe-oublie">Mot de passe oublié</Link>
      <Link href="/partenaire/inscription" className="focus-ring rounded-xl bg-sanispa-ice p-4 font-bold text-sanispa-blue underline">Créer ou compléter mon accès partenaire →</Link>
    </form>}
  </AppShell>;
}
