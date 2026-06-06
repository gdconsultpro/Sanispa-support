"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function ConnexionPage() {
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/espace-client");
    } catch {
      setError("Connexion impossible. Vérifiez votre email et votre mot de passe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell compact>
      <StepHeader eyebrow="Espace client" title="Connexion" description="Connectez-vous pour retrouver vos demandes, vos spas et vos informations." />
      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <Field label="Email" name="email" type="email" value={email} onChange={setEmail} required />
        <Field label="Mot de passe" name="password" type="password" value={password} onChange={setPassword} required />
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <Button type="submit">{loading ? "Connexion..." : "Se connecter"}</Button>
        <div className="grid gap-2 text-sm font-semibold text-sanispa-blue">
          <Link href="/inscription">Créer un compte client</Link>
          <Link href="/mot-de-passe-oublie">Mot de passe oublié</Link>
        </div>
      </form>
    </AppShell>
  );
}
