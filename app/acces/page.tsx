"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CreateAccountForm } from "@/components/CreateAccountForm";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { publicClientIntent } from "@/lib/client-access";
import { emptyDraft, readDraft, readLocalProgress, writeDraft } from "@/lib/storage";

export default function AccessPage() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string>();
  const [intent, setIntent] = useState<ReturnType<typeof publicClientIntent>>("compte");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const draft = readDraft();
    const next = publicClientIntent(new URLSearchParams(window.location.search).get("next") || "compte");
    setEmail(draft.email);
    setProblem(draft.problemType || undefined);
    setIntent(next);
    setReady(true);
    const { data } = getSupabaseBrowser().auth.onAuthStateChange((_event, session) => {
      if (next === "diagnostic") {
        // Supabase broadcasts the session to other tabs. The email link's tab resumes and saves the draft.
        setConfirmed(Boolean(session?.user.email_confirmed_at));
      } else if (session?.user.email_confirmed_at) {
        window.location.replace(`/auth/retour?next=${next}`);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function remember(address: string) {
    const draft = readDraft();
    const isLocalDeclaration = intent === "diagnostic" && !draft.version && !draft.diagnosticId;
    const belongsToAddress = draft.email.trim().toLowerCase() === address;
    const progress = isLocalDeclaration ? readLocalProgress() : null;
    if (progress) {
      const id = draft.draftId || crypto.randomUUID();
      const payload = { ...draft, draftId: id, email: address };
      writeDraft(payload, progress.step);
      return { id, step: progress.step, payload };
    }
    writeDraft(isLocalDeclaration || belongsToAddress ? { ...draft, email: address } : { ...emptyDraft, email: address });
  }

  return (
    <AppShell compact>
      <section className="mx-auto max-w-lg rounded-3xl border border-sanispa-line bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-bold">{confirmed ? "Votre adresse e-mail est confirmée" : "Créer mon compte"}</h1>
        {confirmed ? (
          <>
            <p role="status" className="my-5 leading-7">
              Vous pouvez poursuivre votre déclaration dans l’onglet ouvert depuis votre e-mail ou retrouver votre brouillon dans votre espace spa.
            </p>
            <Link href="/espace-client" className="font-bold underline">Ouvrir mon espace spa</Link>
          </>
        ) : (
          <>
            <p className="my-5 leading-7">
              Votre e-mail, un mot de passe et un seul mail de confirmation. {intent === "diagnostic"
                ? "Vous retrouverez votre déclaration en ouvrant le lien de confirmation, même sur un autre appareil."
                : "Retrouvez ensuite votre spa, son historique et tous vos services gratuits."}
            </p>
            {ready ? <CreateAccountForm intent={intent} initialEmail={email} problemType={problem} beforeSubmit={remember} /> : <p role="status">Chargement…</p>}
          </>
        )}
      </section>
    </AppShell>
  );
}
