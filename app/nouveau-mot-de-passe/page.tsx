"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function NewPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Mot de passe mis à jour. Vous pouvez vous connecter.");
    } catch {
      setError("Impossible de modifier le mot de passe.");
    }
  }

  return (
    <AppShell compact>
      <StepHeader eyebrow="Espace client" title="Nouveau mot de passe" description="Choisissez un nouveau mot de passe sécurisé." />
      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <Field label="Nouveau mot de passe" name="password" type="password" value={password} onChange={setPassword} required />
        {message ? <p className="rounded-md bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <Button type="submit">Enregistrer</Button>
      </form>
    </AppShell>
  );
}
