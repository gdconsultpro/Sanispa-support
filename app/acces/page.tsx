"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { readDraft, saveDraft } from "@/lib/storage";
export default function AccessPage() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { setEmail(readDraft().email); }, []);
    async function send(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const { error } = await getSupabaseBrowser().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: `${window.location.origin}/auth/retour` } });
            if (error)
                throw error;
            setSent(true);
        }
        catch {
            setError("L'envoi n'a pas abouti. Vérifiez votre adresse ou attendez une minute avant de réessayer.");
        }
        finally {
            setBusy(false);
        }
    }
    async function resume() {
        setBusy(true);
        setError("");
        try {
            const { data } = await getSupabaseBrowser().auth.getSession();
            if (!data.session)
                throw new Error("Ouvrez d'abord le lien reçu par e-mail.");
            const draft = readDraft();
            if (draft.problemType && draft.email.toLowerCase() === data.session.user.email?.toLowerCase()) {
                await saveDraft(draft, "/questionnaire");
                window.location.href = "/questionnaire";
            }
            else
                window.location.href = "/espace-client";
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Connexion impossible.");
        }
        finally {
            setBusy(false);
        }
    }
    return <AppShell compact><section className="mx-auto max-w-xl rounded-md border border-sanispa-line bg-white p-6 shadow-soft"><p className="text-sm font-bold text-sanispa-blue">Votre espace personnel</p><h1 className="mt-2 text-2xl font-bold">Retrouvez votre diagnostic à tout moment</h1><p className="my-4 text-sanispa-steel">Recevez un lien personnel par e-mail pour créer votre accès ou vous reconnecter. Aucun nouveau mot de passe à retenir.</p>
 <form onSubmit={send} className="space-y-4"><label className="block font-semibold">Votre adresse e-mail<input required type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setSent(false); }} className="mt-2 block w-full rounded-md border p-3"/></label><Button disabled={busy} type="submit">{busy ? "Veuillez patienter…" : sent ? "Renvoyer le lien" : "Recevoir mon lien d'accès"}</Button></form>
 {sent ? <div className="mt-4 rounded-md bg-sanispa-ice p-4" role="status"><p>Consultez votre boîte mail, y compris les indésirables, puis ouvrez le lien personnel. Vos coordonnées restent sur cet appareil jusqu'à la confirmation.</p><button type="button" onClick={resume} disabled={busy} className="mt-3 font-bold underline">J'ai confirmé mon adresse, continuer ici</button></div> : null}
 {error ? <p className="mt-4 text-red-700" role="alert">{error}</p> : null}<Link className="mt-5 block underline" href="/connexion">J'ai déjà un mot de passe</Link></section></AppShell>;
}
