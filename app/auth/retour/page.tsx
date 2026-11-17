"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { problemTypes } from "@/lib/questions";
import { confirmedClientDestination } from "@/lib/client-access";
import { emptyDraft, readDraft, saveDraft, writeDraft } from "@/lib/storage";
export default function Callback() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        if (new URLSearchParams(window.location.hash.slice(1)).has("error"))
          throw new Error(
            "Ce lien est invalide ou expiré. Demandez un nouveau lien d’accès.",
          );
        const { data, error } = await getSupabaseBrowser().auth.getSession();
        if (error || !data.session?.user.email_confirmed_at)
          throw new Error(
            "Ce lien est invalide ou expiré. Demandez un nouveau lien d'accès.",
          );
        const draft = readDraft();
        const query = new URLSearchParams(window.location.search);
        const destination = confirmedClientDestination(
          draft,
          data.session.user.email || "",
          query.get("next") === "diagnostic",
        );
        if (destination === "/questionnaire") {
          await saveDraft(draft, "/questionnaire");
          if (active) window.location.replace("/questionnaire");
        } else if (active && destination === "/diagnostic") {
          const requested = new URLSearchParams(window.location.search).get(
            "problemType",
          );
          const problemType =
            problemTypes.find((p) => p.value === requested)?.value || "";
          writeDraft({
            ...emptyDraft,
            email: data.session.user.email || "",
            problemType,
          });
          window.location.replace("/diagnostic");
        } else if (active) {
          window.location.replace("/espace-client");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Connexion impossible.");
      }
    }
    void finish();
    return () => {
      active = false;
    };
  }, []);
  return (
    <AppShell compact>
      <h1 className="text-2xl font-bold">
        {error ? "Votre accès client" : "Ouverture de votre espace…"}
      </h1>
      {error ? (
        <>
          <p role="alert" className="mt-4">
            {error}
          </p>
          <Link className="mt-4 block underline" href="/acces">
            Recevoir un nouveau lien
          </Link>
        </>
      ) : null}
    </AppShell>
  );
}
