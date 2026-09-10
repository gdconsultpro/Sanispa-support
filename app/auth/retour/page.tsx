"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { readDraft, saveDraft, clearDraft } from "@/lib/storage";
export default function Callback() {
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        async function finish() {
            try {
                const { data, error } = await getSupabaseBrowser().auth.getSession();
                if (error || !data.session?.user.email_confirmed_at)
                    throw new Error("Ce lien est invalide ou expiré. Demandez un nouveau lien d'accès.");
                const draft = readDraft();
                if (draft.problemType && !draft.diagnosticId && draft.email.toLowerCase() === data.session.user.email?.toLowerCase()) {
                    await saveDraft(draft, "/questionnaire");
                    if (active)
                        window.location.replace("/questionnaire");
                }
                else if (active) {
                    clearDraft();
                    window.location.replace("/espace-client");
                }
            }
            catch (e) {
                if (active)
                    setError(e instanceof Error ? e.message : "Connexion impossible.");
            }
        }
        void finish();
        return () => { active = false; };
    }, []);
    return <AppShell compact><h1 className="text-2xl font-bold">{error ? "Votre accès client" : "Ouverture de votre espace…"}</h1>{error ? <><p role="alert" className="mt-4">{error}</p><Link className="mt-4 block underline" href="/acces">Recevoir un nouveau lien</Link></> : null}</AppShell>;
}
