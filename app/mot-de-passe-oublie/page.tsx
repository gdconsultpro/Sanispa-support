"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nouveau-mot-de-passe`
      });
      if (error) throw error;
      setMessage("Email envoyé. Cliquez sur le lien reçu pour définir un nouveau mot de passe.");
    } catch {
      setError("Envoi impossible pour le moment.");
    }
  }

  return (
    <AppShell compact>
      <StepHeader eyebrow="Espace client" title="Mot de passe oublié" description="Recevez un lien sécurisé pour réinitialiser votre mot de passe." />
      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <Field label="Email" name="email" type="email" value={email} onChange={setEmail} required />
        {message ? <p className="rounded-md bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <Button type="submit">Recevoir le lien</Button>
      </form>
    </AppShell>
  );
}
