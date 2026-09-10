"use client";
import { useEffect, useState } from "react";
import { saveDraft, writeDraft } from "@/lib/storage";
import type { DiagnosticDraft } from "@/lib/types";
export function DraftSave({ draft, step }: {
    draft: DiagnosticDraft;
    step: string;
}) {
    const [message, setMessage] = useState("");
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!draft.draftId || draft.diagnosticId)
            return;
        let active = true;
        setMessage("Sauvegarde en cours…");
        const timer = setTimeout(() => {
            try {
                writeDraft(draft);
            }
            catch (e) {
                setMessage(e instanceof Error ? e.message : "Sauvegarde impossible.");
                return;
            }
            saveDraft(draft, step).then(() => { if (active)
                setMessage("Enregistré dans votre espace client : votre brouillon n’est pas encore envoyé à SANISPA."); }, e => { if (active)
                setMessage(e.message); });
        }, 800);
        return () => { active = false; clearTimeout(timer); };
    }, [draft, step, retry]);
    if (!draft.draftId)
        return null;
    return <div className="mb-4 rounded-md bg-white p-3 text-sm" role="status"><span>{message}</span>{message && !message.startsWith("Enregistré") && !message.startsWith("Sauvegarde en cours") ? <button type="button" className="ml-3 underline" onClick={() => setRetry(v => v + 1)}>Réessayer</button> : null}<p className="mt-1 text-xs text-sanispa-steel">Après confirmation de sauvegarde, retrouvez votre saisie dans « Mes brouillons » de votre espace client. Attendez cette confirmation avant de quitter la page.</p></div>;
}
