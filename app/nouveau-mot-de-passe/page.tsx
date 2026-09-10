"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function NewPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!changed && (password.length < 12 || password.length > 128 || password !== confirmation)) {
      setError("Choisissez un mot de passe de 12 à 128 caractères et saisissez-le à l’identique dans les deux champs."); return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      if (!changed) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          if (error.code === "same_password") throw new Error("Choisissez un mot de passe différent de votre ancien mot de passe, puis réessayez sur cette page.");
          if (error.code === "weak_password") throw new Error("Ce mot de passe ne respecte pas les règles de sécurité. Choisissez une phrase plus longue et unique, puis réessayez.");
          throw new Error("Le mot de passe n’a pas pu être modifié. Réessayez ou demandez un nouveau lien de réinitialisation.");
        }
        setChanged(true); setPassword(""); setConfirmation("");
      }
      const signedOut = await supabase.auth.signOut({ scope: "global" });
      if (signedOut.error) throw new Error("Le mot de passe est modifié. Réessayez pour terminer la révocation des sessions.");
      setMessage("Mot de passe modifié et sessions révoquées. Reconnectez-vous avec votre nouveau mot de passe.");
    } catch (e) { setError(e instanceof Error ? e.message : "Modification impossible. Réessayez."); }
    finally { setBusy(false); }
  }
  return <AppShell compact>
    <StepHeader eyebrow="Sécurité du compte" title="Nouveau mot de passe" description="Utilisez au moins 12 caractères. Une phrase longue et unique est plus facile à retenir." />
    <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
      {!changed && <><Field label="Nouveau mot de passe" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={setPassword} required /><Field label="Confirmer le mot de passe" name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={setConfirmation} required /></>}
      {message && <><p role="status" className="rounded-md bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p><Link href="/connexion" className="block font-bold underline">Connexion client</Link><Link href="/admin/connexion" className="block font-bold underline">Connexion administrateur</Link></>}
      {error && <><p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>{!changed && <Link href="/mot-de-passe-oublie" className="block font-bold underline">Demander un nouveau lien de réinitialisation</Link>}</>}
      {!message && <Button type="submit" disabled={busy}>{busy ? "Sécurisation…" : changed ? "Révoquer les sessions" : "Enregistrer et révoquer les sessions"}</Button>}
    </form>
  </AppShell>;
}
