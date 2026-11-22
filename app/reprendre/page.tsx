"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { publicDeclarationResumePath } from "@/lib/client-drafts";
import { readLocalProgress, restoreDraft } from "@/lib/storage";

export default function ResumeDraft() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function resume() {
      const params = new URLSearchParams(window.location.search);
      if (params.get("local") === "1") {
        const progress = readLocalProgress();
        const { data } = await getSupabaseBrowser().auth.getSession();
        const email = data.session?.user.email?.toLowerCase();
        if (!progress || (email && progress.draft.email && email !== progress.draft.email.trim().toLowerCase())) {
          throw new Error("Aucun brouillon à reprendre sur cet appareil pour ce compte.");
        }
        const confirmed = Boolean(data.session?.user.email_confirmed_at);
        if (confirmed && !progress.pending && progress.draft.draftId) {
          const result = await restoreDraft(progress.draft.draftId);
          if (active) window.location.replace(result.step);
        } else if (active) {
          window.location.replace(confirmed ? progress.step : publicDeclarationResumePath(progress.step));
        }
        return;
      }
      const id = params.get("id");
      if (!id) throw new Error("Sélectionnez un brouillon dans votre espace spa.");
      const result = await restoreDraft(id);
      if (active) window.location.replace(result.step);
    }
    void resume().catch((cause) => {
      if (!active) return;
      setError(cause instanceof TypeError
        ? "Connexion interrompue. Réessayez lorsque le réseau est disponible."
        : cause instanceof Error ? cause.message : "Impossible de reprendre votre brouillon.");
    });
    return () => { active = false; };
  }, []);

  return (
    <AppShell compact>
      <h1 className="text-2xl font-bold">Reprendre ma déclaration</h1>
      {error ? (
        <>
          <p className="mt-3" role="alert">{error}</p>
          <Link href="/espace-client?view=demandes" className="mt-4 block font-bold underline">Retrouver mes brouillons</Link>
        </>
      ) : <p className="mt-3" role="status">Récupération de votre saisie…</p>}
    </AppShell>
  );
}
