"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function PartnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowser();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const token = data.session?.access_token;
      if (!token) throw new Error("Session introuvable.");

      const response = await fetch("/api/partner/session", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        await supabase.auth.signOut();
        throw new Error("Aucun accès partenaire actif n'est associé à ce compte.");
      }

      router.push("/partenaire/leads");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Connexion partenaire impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Espace partenaire"
        title="Connexion partenaire"
        description="Connectez-vous pour consulter les demandes techniques disponibles dans vos secteurs."
      />

      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <Field label="Email" name="email" type="email" value={email} onChange={setEmail} required />
        <Field label="Mot de passe" name="password" type="password" value={password} onChange={setPassword} required />
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <Button type="submit">{loading ? "Connexion..." : "Se connecter"}</Button>
        <Link href="/mot-de-passe-oublie" className="block text-sm font-semibold text-sanispa-blue">
          Mot de passe oublié
        </Link>
      </form>
    </AppShell>
  );
}
