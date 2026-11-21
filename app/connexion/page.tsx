"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { publicClientIntent } from "@/lib/client-access";
import { clientCaseReturnPath } from "@/lib/client-case-navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
export default function ConnexionPage() {
    const router = useRouter();
    const [intent, setIntent] = useState<ReturnType<typeof publicClientIntent>>("compte");
    useEffect(() => { setIntent(publicClientIntent(new URLSearchParams(window.location.search).get("next") || "compte")); }, []);
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
            if (error)
                throw error;
            const query = new URLSearchParams(window.location.search);
            const destination = clientCaseReturnPath(query.get("retour"));
            const next = publicClientIntent(query.get("next") || "compte");
            if (destination) router.replace(destination);
            else router.push(`/auth/retour?next=${next}`);
        }
        catch {
            setError("Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe. Si nécessaire, utilisez le lien « Mot de passe oublié » pour retrouver votre accès.");
        }
        finally {
            setLoading(false);
        }
    }
    return (<AppShell compact>
      <StepHeader eyebrow="Espace client" title="Connexion" description="Connectez-vous pour retrouver vos demandes, vos documents et les informations de vos spas."/>
      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <Field label="Adresse e-mail" name="email" type="email" value={email} onChange={setEmail} required/>
        <Field label="Mot de passe" name="password" type="password" value={password} onChange={setPassword} required/>
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <Button type="submit" disabled={loading}>{loading ? "Connexion..." : "Se connecter"}</Button>
        <div className="grid gap-2 text-sm font-semibold text-sanispa-blue">
          <Link href={`/acces?next=${intent}`}>Créer mon compte gratuit</Link>
          <Link href="/mot-de-passe-oublie">Mot de passe oublié</Link>
        </div>
      </form>
    </AppShell>);
}
