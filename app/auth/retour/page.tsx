"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { problemTypes } from "@/lib/questions";
import { adminLoginPath } from "@/lib/admin-navigation";
import { confirmedClientDestination } from "@/lib/client-access";
import { emptyDraft, readDraft, readLocalProgress, restoreDraft, saveDraft, writeDraft } from "@/lib/storage";
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
        if (!active) return;
        if (new URLSearchParams(window.location.hash.slice(1)).has("error"))
          throw new Error(
            "Ce lien est invalide ou expiré. Demandez un nouveau lien d’accès.",
          );
        const { data, error } = await getSupabaseBrowser().auth.getSession();
        if (!active) return;
        if (error || !data.session?.user.email_confirmed_at)
          throw new Error(
            "Ce lien est invalide ou expiré. Demandez un nouveau lien d'accès.",
          );
        const query = new URLSearchParams(window.location.search);
        const next = query.get("next");
        const signupDraft = next === "diagnostic" ? query.get("draft") : null;
        if (signupDraft) {
          const { step } = await restoreDraft(signupDraft, { signup: true });
          if (active) window.location.replace(step);
          return;
        }
        const draft = readDraft();
        const progress = readLocalProgress();
        const destination = next === "partenaire" ? "/partenaire/inscription" : next === "compte" ? "/espace-client" : ["carnet", "releves", "notices", "assistant", "forum"].includes(next || "") ? `/premium/${next}` : query.get("next") === "visio" ? "/visio" : query.get("next") === "admin" ? adminLoginPath(query.get("dossier"), query.get("section")) : query.get("next") === "recovery" ? "/nouveau-mot-de-passe" : query.get("next") === "premium" ? "/premium" : confirmedClientDestination(
          draft,
          data.session.user.email || "",
          query.get("next") === "diagnostic",
        );
        if (destination === "/questionnaire" || destination === "/upload") {
          const step = progress?.updatedAt ? progress.step : destination;
          const email = data.session.user.email || "";
          let nextDraft = { ...draft, email };
          if (!draft.email.trim()) {
            try {
              const response = await fetch("/api/client/profile", {
                headers: { Authorization: `Bearer ${data.session.access_token}` }, signal: AbortSignal.timeout(5000),
              });
              if (response.ok) {
                const { profile } = await response.json();
                nextDraft = {
                  ...nextDraft,
                  name: draft.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
                  phone: draft.phone || profile?.phone || "",
                  address: draft.address || profile?.address || "",
                  postalCode: draft.postalCode || profile?.postal_code || "",
                  city: draft.city || profile?.city || "",
                };
              }
            } catch { /* Les coordonnées manquantes pourront être renseignées dans le résumé. */ }
          }
          await saveDraft(nextDraft, step);
          if (active) window.location.replace(step);
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
          <Link className="mt-4 block underline" href="/espace-client">
            Retrouver mon espace spa
          </Link>
        </>
      ) : null}
    </AppShell>
  );
}
