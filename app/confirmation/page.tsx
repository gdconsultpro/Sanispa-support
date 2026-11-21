"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
import { clientRequest } from "@/lib/client-browser-api";
import { clientCaseProgress, type ClientCase } from "@/lib/client-case-progress";
import { clearDraft, readDraft } from "@/lib/storage";

export default function Confirmation() {
  const [dossier, setDossier] = useState<ClientCase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id) return;
      const data = await clientRequest(`/api/client/dashboard?followUp=1&id=${encodeURIComponent(id)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const found = data.diagnostics?.[0];
      if (!found) return;
      setDossier(found);
      if (readDraft().diagnosticId === id) clearDraft();
    }
    void load().catch(() => {}).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const progress = dossier ? clientCaseProgress(dossier) : null;
  return (
    <AppShell compact>
      <section className="mx-auto max-w-2xl rounded-2xl border border-sanispa-line bg-white p-6">
        <h1 className="text-2xl font-bold">{dossier ? "Demande envoyée à SANISPA" : "Votre demande SANISPA"}</h1>
        {dossier && progress ? (
          <>
            <p className="mt-3 font-bold">Dossier n°{dossier.public_reference || "Référence en cours"}</p>
            <div className="mt-4 rounded-xl bg-sanispa-ice p-4">
              <p className="font-bold">{progress.label}</p>
              <p className="mt-1 text-sm">{progress.description}</p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <ButtonLink href={progress.href}>{progress.action}</ButtonLink>
              <Link href="/espace-client?view=demandes" className="font-bold underline">Toutes mes demandes</Link>
            </div>
            {dossier.problem_type !== "demenagement" && !dossier.visios?.length ? (
              <Link href={`/visio?diagnosticId=${dossier.id}`} className="mt-4 inline-block text-sm font-bold underline">
                Demander une aide en visio
              </Link>
            ) : null}
          </>
        ) : (
          <>
            <p role="status" className="mt-3">{loading ? "Vérification de votre dossier…" : "Retrouvez l’état de votre demande dans votre espace spa."}</p>
            {!loading ? <Link href="/espace-client?view=demandes" className="mt-4 inline-block font-bold underline">Voir mes demandes</Link> : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
