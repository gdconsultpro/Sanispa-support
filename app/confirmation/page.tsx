"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { clearDraft } from "@/lib/storage";

export default function ConfirmationPage() {
  const [emailSent, setEmailSent] = useState<string | null>(null);

  useEffect(() => {
    clearDraft();
    const params = new URLSearchParams(window.location.search);
    setEmailSent(params.get("emailSent"));
  }, []);

  const emailFailed = emailSent === "0";

  return (
    <AppShell compact>
      <section className="rounded-md border border-sanispa-line bg-white p-6 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-sanispa-ice text-sanispa-blue">
          <CheckCircle2 size={30} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-sanispa-navy">Votre demande a bien été enregistrée.</h1>
        {emailFailed ? (
          <p className="mx-auto mt-3 max-w-xl rounded-md bg-red-50 p-3 text-base leading-7 text-red-700">
            Votre demande a bien été enregistrée mais l'email de confirmation n'a pas pu être envoyé automatiquement. Vous retrouverez votre dossier dans votre espace client.
          </p>
        ) : (
          <div className="mx-auto mt-3 max-w-xl text-base leading-7 text-sanispa-steel">
            <p>Un email de confirmation vient de vous être envoyé.</p>
            <p className="mt-2 font-semibold text-sanispa-navy">Pensez à vérifier vos courriers indésirables.</p>
          </div>
        )}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link className="focus-ring inline-flex min-h-12 items-center justify-center rounded-md bg-sanispa-navy px-5 py-3 text-sm font-bold text-white" href="/espace-client">
            Accéder à mon espace client
          </Link>
          <Link className="focus-ring inline-flex min-h-12 items-center justify-center rounded-md border border-sanispa-line bg-white px-5 py-3 text-sm font-bold text-sanispa-navy" href="/">
            Retour à l'accueil
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
