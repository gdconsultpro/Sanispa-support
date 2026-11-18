"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { problemTypes } from "@/lib/questions";
import { confirmedClientDestination } from "@/lib/client-access";
import { emptyDraft, readDraft, saveDraft, writeDraft } from "@/lib/storage";
export default function Callback() {
  const [error, setError] = useState("");
  const confirmation = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        if (!confirmation.current) confirmation.current = (async () => {
          const fragment = new URLSearchParams(window.location.hash.slice(1));
          const token = fragment.get("token_hash");
          if (!token) return;
          const type = fragment.get("type");
          if (!/^[A-Za-z0-9_-]{32,256}$/.test(token) || (type !== "email" && type !== "recovery"))
            throw new Error("Ce lien est invalide. Demandez un nouveau lien d’accès.");
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          const result = await getSupabaseBrowser().auth.verifyOtp({ token_hash: token, type });
          if (result.error) throw new Error("Ce lien est invalide ou expiré. Demandez un nouveau lien d’accès.");
        })();
        await confirmation.current;
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
        const next = query.get("next");
        const destination = ["carnet", "releves", "notices"].includes(next || "") ? `/premium/${next}` : query.get("next") === "visio" ? "/visio" : query.get("next") === "admin" ? "/admin/connexion" : query.get("next") === "recovery" ? "/nouveau-mot-de-passe" : query.get("next") === "premium" ? "/premium" : confirmedClientDestination(
          draft,
          data.session.user.email || "",
          query.get("next") === "diagnostic",
        );
        if (destination === "/questionnaire" || destination === "/upload") {
          await saveDraft(draft, destination);
          if (active) window.location.replace(destination);
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
          window.location.replace(destination);
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
