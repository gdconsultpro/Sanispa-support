"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function InscriptionPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    address: "",
    postalCode: "",
    city: "",
    spaBrand: "",
    spaModel: "",
    spaYear: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/connexion`,
          data: form
        }
      });
      if (error) throw error;
      setMessage("Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.");
    } catch {
      setError("Création du compte impossible pour le moment.");
    }
  }

  return (
    <AppShell compact>
      <StepHeader eyebrow="Espace client" title="Créer un compte" description="Vos informations pourront être réutilisées lors de vos prochaines demandes." />
      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" name="firstName" value={form.firstName} onChange={(value) => update("firstName", value)} required />
          <Field label="Nom" name="lastName" value={form.lastName} onChange={(value) => update("lastName", value)} required />
          <Field label="Téléphone" name="phone" value={form.phone} onChange={(value) => update("phone", value)} required />
          <Field label="Email" name="email" type="email" value={form.email} onChange={(value) => update("email", value)} required />
          <Field label="Mot de passe" name="password" type="password" value={form.password} onChange={(value) => update("password", value)} required />
          <Field label="Adresse" name="address" value={form.address} onChange={(value) => update("address", value)} />
          <Field label="Code postal" name="postalCode" value={form.postalCode} onChange={(value) => update("postalCode", value)} required />
          <Field label="Ville" name="city" value={form.city} onChange={(value) => update("city", value)} required />
          <Field label="Marque du spa" name="spaBrand" value={form.spaBrand} onChange={(value) => update("spaBrand", value)} />
          <Field label="Modèle du spa" name="spaModel" value={form.spaModel} onChange={(value) => update("spaModel", value)} />
          <Field label="Année approximative" name="spaYear" value={form.spaYear} onChange={(value) => update("spaYear", value)} />
        </div>
        {message ? <p className="rounded-md bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <Button type="submit">Créer mon compte</Button>
        <Link href="/connexion" className="block text-sm font-semibold text-sanispa-blue">J'ai déjà un compte</Link>
      </form>
    </AppShell>
  );
}
