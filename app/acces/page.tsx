"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MailCheck, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { clientConfirmationUrl } from "@/lib/client-access";
import { emptyDraft, readDraft, writeDraft } from "@/lib/storage";
export default function AccessPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    setEmail(readDraft().email);
    if (new URLSearchParams(window.location.search).get("sent") === "1") {
      setSent(true);
      setCooldown(60);
    }
    const tick = window.setInterval(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    // The mail may be opened in another tab: resume here without a second confirmation.
    let auth: ReturnType<typeof getSupabaseBrowser>;
    try {
      auth = getSupabaseBrowser();
    } catch {
      return () => window.clearInterval(tick);
    }
    const subscription = auth.auth.onAuthStateChange((_event, session) => {
      if (session?.user.email_confirmed_at)
        window.location.replace(new URLSearchParams(window.location.search).get("next") === "premium" ? "/auth/retour?next=premium" : "/auth/retour?next=diagnostic");
    });
    return () => {
      window.clearInterval(tick);
      subscription.data.subscription.unsubscribe();
    };
  }, []);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || cooldown) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const normalized = email.trim().toLowerCase();
      const previous = readDraft();
      const draft =
        previous.email.trim().toLowerCase() === normalized
          ? previous
          : { ...emptyDraft, email: normalized };
      writeDraft(draft);
      const { error } = await getSupabaseBrowser().auth.signInWithOtp({
        email: normalized,
        options: {
          emailRedirectTo: clientConfirmationUrl(
            window.location.origin,
            draft.problemType,
            new URLSearchParams(window.location.search).get("next") === "premium" ? "premium" : "diagnostic",
          ),
        },
      });
      if (error) throw error;
      setSent(true);
      setCooldown(60);
    } catch {
      setError(
        "L’envoi n’a pas abouti. Vérifiez l’adresse et réessayez dans un instant. Votre déclaration reste enregistrée sur cet appareil.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <AppShell compact>
      <section className="mx-auto max-w-xl rounded-md border border-sanispa-line bg-white p-6 shadow-soft sm:p-9">
        <div className="mb-5 inline-flex rounded-2xl bg-sanispa-ice p-4 text-sanispa-blue">
          <MailCheck size={32} aria-hidden="true" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-sanispa-blue">
          Votre compte en un lien
        </p>
        <h1 className="mt-3 text-3xl font-bold">
          {sent ? "Votre déclaration vous attend" : "Un e-mail, et c’est parti"}
        </h1>
        <p className="my-5 leading-7 text-sanispa-steel">
          {sent
            ? "Ouvrez le lien reçu par e-mail : il confirme votre adresse et vous ramène directement à votre déclaration. Aucun autre bouton de confirmation à valider."
            : "Indiquez votre adresse. Le lien reçu confirme votre compte et vous permet de déclarer la panne de votre spa. Aucun mot de passe à créer."}
        </p>
        <form onSubmit={send} className="space-y-4">
          <label className="block text-sm font-bold">
            Votre adresse e-mail
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSent(false);
              }}
              className="focus-ring mt-2 block min-h-12 w-full rounded-xl border border-sanispa-line p-3"
            />
          </label>
          <Button
            disabled={busy || cooldown > 0}
            type="submit"
            className="w-full"
          >
            {busy
              ? "Envoi du lien…"
              : cooldown
                ? `Nouvel envoi possible dans ${cooldown} s`
                : sent
                  ? "Renvoyer mon lien"
                  : "Créer mon accès et recevoir le lien"}
            <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </form>
        {sent ? (
          <p
            role="status"
            className="mt-4 rounded-xl bg-sanispa-ice p-4 text-sm leading-6"
          >
            Pensez à vérifier les courriers indésirables. Ouvrez le lien sur cet
            appareil pour retrouver toutes vos informations ; sur un autre
            appareil, vous pourrez commencer votre déclaration sans nouvelle
            confirmation.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <Link
          className="focus-ring mt-6 inline-block rounded text-sm font-bold text-sanispa-blue underline"
          href="/connexion"
        >
          Déjà un compte avec mot de passe ?
        </Link>
      </section>
    </AppShell>
  );
}
