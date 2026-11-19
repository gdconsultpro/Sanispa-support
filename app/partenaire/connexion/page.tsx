"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { loadPartnerSession, partnerAuthError } from "@/lib/partner-browser";
import { partnerPasswordPath, partnerReturnPath, withPartnerTimeout } from "@/lib/partner-navigation";
export default function PartnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"email" | "password">("email");
  const [sent, setSent] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || sent) return;
    pending.current = true; setLoading(true); setError("");
    try {
      if (method === "email") {
        const response = await fetch("/api/client/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), next: "partenaire" }),
        });
        if (!response.ok) throw new Error("Le lien n’a pas pu être envoyé. Réessayez dans une minute.");
        setSent(true);
        return;
      }
      const { data, error: signInError } = await withPartnerTimeout(getSupabaseBrowser().auth.signInWithPassword({ email: email.trim(), password }));
      if (signInError) throw signInError;
      if (!data.session?.access_token) throw new Error("La connexion n’a pas ouvert de session. Réessayez.");
      const session = await loadPartnerSession(data.session.access_token);
      const next = partnerReturnPath(new URLSearchParams(window.location.search).get("next"));
      router.replace(session.passwordChangeRequired ? partnerPasswordPath(next) : next);
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { pending.current = false; setLoading(false); }
  }
  return <AppShell compact>
    <StepHeader eyebrow="Espace partenaire" title="Connexion partenaire" description="Recevez un lien par e-mail pour ouvrir votre espace professionnel gratuit. Vous pouvez aussi utiliser votre mot de passe existant." />
    <form onSubmit={submit} className="grid gap-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft" aria-busy={loading}>
      <div className="flex flex-wrap gap-3"><button type="button" aria-pressed={method === "email"} onClick={() => { setMethod("email"); setSent(false); setError(""); }} className="focus-ring rounded-full border px-4 py-3 font-bold">Lien par e-mail</button><button type="button" aria-pressed={method === "password"} onClick={() => { setMethod("password"); setSent(false); setError(""); }} className="focus-ring rounded-full border px-4 py-3 font-bold">Mot de passe existant</button></div>
      <Field label="Adresse e-mail" type="email" name="email" value={email} onChange={setEmail} required autoComplete="username" />
      {method === "password" ? <Field label="Mot de passe" type="password" name="password" value={password} onChange={setPassword} required autoComplete="current-password" /> : null}
      {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <Button type="submit" disabled={loading || sent}>{loading ? "Préparation de votre accès…" : sent ? "Lien envoyé" : method === "email" ? "Recevoir mon lien partenaire" : "Se connecter"}</Button>
      {sent ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm">Ouvrez le lien reçu par e-mail. Vous retrouverez votre entreprise ou pourrez créer votre accès partenaire.</p> : null}
      <Link className="focus-ring text-sm font-bold text-sanispa-blue underline" href="/mot-de-passe-oublie">Mot de passe oublié</Link>
      <Link href="/partenaire/inscription" className="focus-ring rounded-xl bg-sanispa-ice p-4 font-bold text-sanispa-blue underline">Nouveau partenaire ? Créer mon espace gratuit →</Link>
    </form>
  </AppShell>;
}
