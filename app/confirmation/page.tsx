"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { clearDraft } from "@/lib/storage";

export default function ConfirmationPage() {
  useEffect(() => {
    clearDraft();
  }, []);

  return (
    <AppShell compact>
      <section className="rounded-md border border-sanispa-line bg-white p-6 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-sanispa-ice text-sanispa-blue">
          <CheckCircle2 size={30} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-sanispa-navy">Demande transmise à SANISPA</h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-sanispa-steel">
          Votre dossier de pré-diagnostic a été enregistré. SANISPA vous recontactera selon l'orientation choisie.
        </p>
        <Link className="focus-ring mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-sanispa-navy px-5 py-3 text-sm font-bold text-white" href="/">
          Retour à l'accueil
        </Link>
      </section>
    </AppShell>
  );
}
