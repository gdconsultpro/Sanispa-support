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
      setMessage("Si un compte correspond à cette adresse, vous recevrez un e-mail pour réinitialiser votre mot de passe. Consultez votre boîte e-mail et vos courriers indésirables, puis ouvrez le lien reçu.");
    } catch {
      setError("La demande n’a pas abouti. Vérifiez votre adresse e-mail et votre connexion, puis réessayez.");
    }
  }

  return (
    <AppShell compact>
      <StepHeader eyebrow="Espace client" title="Mot de passe oublié" description="Recevez un lien sécurisé pour réinitialiser votre mot de passe." />
      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <Field label="Adresse e-mail" name="email" type="email" value={email} onChange={setEmail} required />
        {message ? <p className="rounded-md bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <Button type="submit">Recevoir le lien de réinitialisation</Button>
      </form>
    </AppShell>
  );
}
