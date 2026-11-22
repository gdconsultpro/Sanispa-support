"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { shopLinksForProblem, spaPartsShopLink } from "@/components/ShopLinks";
import { ButtonLink } from "@/components/Button";
import { clientRequest } from "@/lib/client-browser-api";
import { clientDossierPath } from "@/lib/client-case-navigation";
import { clientCaseProgress, type ClientCase } from "@/lib/client-case-progress";
import { clearDraft, readDraft } from "@/lib/storage";
import { videoAssistanceOffer } from "@/lib/commercial-mode";

const nextStepLink = "focus-ring inline-flex min-h-11 items-center text-sm font-semibold text-sanispa-blue underline";

function NextStep({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <article className="flex min-w-0 flex-col rounded-xl border border-sanispa-line bg-[var(--sanispa-background)] p-4">
    <h3 className="text-base font-bold">{title}</h3>
    <p className="mt-2 flex-1 text-sm leading-6 text-sanispa-steel">{description}</p>
    <div className="mt-2 grid justify-items-start">{children}</div>
  </article>;
}

function DiagnosticNextSteps({ dossier }: { dossier: ClientCase }) {
  const shopLinks = shopLinksForProblem(dossier.problem_type);
  const intervention = dossier.choice === "intervention" || Boolean(dossier.assigned_partner);
  const video = dossier.visios?.[0];
  return <section aria-labelledby="next-steps" className="mt-6">
    <h2 id="next-steps" className="sanispa-display-title text-2xl">Quelle suite souhaitez-vous donner ?</h2>
    <div className="mt-3 grid gap-3 lg:grid-cols-3">
      <NextStep title="Trouver un technicien" description={intervention
        ? "SANISPA prend en charge votre demande de mise en relation. Retrouvez son avancement et votre créneau dans le dossier."
        : "Vous souhaitez une intervention sur place ? Indiquez votre numéro de dossier à SANISPA pour que l’équipe retrouve votre prédiagnostic."}>
        {intervention
          ? <Link className={nextStepLink} href={clientDossierPath(dossier.id)}>Suivre ma demande</Link>
          : <a className={nextStepLink} href="https://www.sani-spa.fr/contact/" target="_blank" rel="noreferrer">Contacter SANISPA ↗</a>}
      </NextStep>
      <NextStep title="Acheter des pièces ou des produits" description="Accédez à la boutique SANISPA. Vérifiez la référence et la compatibilité avec votre spa avant de commander.">
        {(shopLinks.length ? shopLinks : [spaPartsShopLink]).map(link =>
          <a key={link.href} className={nextStepLink} href={link.href} target="_blank" rel="noreferrer">{link.label} ↗</a>)}
      </NextStep>
      <NextStep title="Accompagnement technique en visio" description={video
        ? "Retrouvez l’état de votre demande de visio, puis le créneau et le lien de connexion après confirmation."
        : `Un technicien SANISPA examine les symptômes avec vous à distance et vous guide pendant ${videoAssistanceOffer.durationMinutes} minutes.`}>
        <Link className={nextStepLink} href={`/visio?diagnosticId=${encodeURIComponent(dossier.id)}`}>
          {video ? "Suivre ma visio" : "Demander une visio"}
        </Link>
      </NextStep>
    </div>
  </section>;
}

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
  const activeWaterAssistant = dossier?.choice === "remote" && dossier.problem_type === "traitement-eau";
  const moving = dossier?.problem_type === "demenagement";
  return (
    <AppShell compact>
      <section className={`mx-auto rounded-2xl border border-sanispa-line bg-white p-5 sm:p-6 ${dossier && !moving ? "max-w-4xl" : "max-w-2xl"}`}>
        <h1 className="sanispa-display-title text-3xl">{dossier ? "Demande envoyée à SANISPA" : "Votre demande SANISPA"}</h1>
        {dossier && progress ? (
          <>
            <p className="mt-3 font-bold">Dossier n°{dossier.public_reference || "Référence en cours"}</p>
            <div className="mt-4 rounded-xl bg-sanispa-ice p-4">
              {progress.label !== "Demande reçue" ? <p className="font-bold">{progress.label}</p> : null}
              <p className="mt-1 text-sm">{progress.description}</p>
            </div>
            {moving || (dossier.choice !== "intervention" && !dossier.assigned_partner) || activeWaterAssistant ? (
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <ButtonLink href={clientDossierPath(dossier.id)}>Suivre ma demande</ButtonLink>
                {activeWaterAssistant ? <ButtonLink href={`/premium/assistant?topic=eau&diagnosticId=${encodeURIComponent(dossier.id)}`} variant="secondary">Ouvrir l’assistant de traitement d’eau</ButtonLink> : null}
              </div>
            ) : null}
            {!moving ? <DiagnosticNextSteps dossier={dossier} /> : null}
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
