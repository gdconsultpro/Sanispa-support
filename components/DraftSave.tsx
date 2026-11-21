"use client";

import { useEffect, useState } from "react";
import { saveDraft, writeDraft } from "@/lib/storage";
import type { DraftStep } from "@/lib/client-drafts";
import type { DiagnosticDraft } from "@/lib/types";

export function DraftSave({ draft, step, sync = true }: {
  draft: DiagnosticDraft;
  step: DraftStep;
  sync?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const canSync = sync && Boolean(draft.draftId);

  useEffect(() => {
    if (!draft.problemType || draft.diagnosticId) return;
    setFailed(false);
    try {
      writeDraft(draft, step);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sauvegarde impossible.");
      setFailed(true);
      return;
    }
    setMessage(canSync ? "Enregistré sur cet appareil. Synchronisation en cours…" : "Brouillon enregistré sur cet appareil.");
    if (!canSync) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void saveDraft(draft, step).then(() => {
        if (active) setMessage("Brouillon enregistré dans votre compte. Vous pourrez le reprendre dans Mon espace spa.");
      }, (error) => {
        if (!active) return;
        setFailed(true);
        const message = error instanceof TypeError
          ? "Connexion interrompue. Votre brouillon est enregistré sur cet appareil."
          : error instanceof Error ? error.message : "Impossible de synchroniser le brouillon.";
        setMessage(message);
      });
    }, 800);
    return () => { active = false; window.clearTimeout(timer); };
  }, [draft, step, retry, canSync]);

  if (!draft.problemType || draft.diagnosticId || !message) return null;
  return (
    <div className="mb-4 rounded-md bg-white p-3 text-sm" role="status">
      {message} {failed ? <button type="button" className="ml-2 font-bold underline" onClick={() => setRetry(value => value + 1)}>Réessayer</button> : null}
    </div>
  );
}
