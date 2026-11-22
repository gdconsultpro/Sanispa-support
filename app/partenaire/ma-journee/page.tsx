"use client";

import { MapPin, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, ButtonLink } from "@/components/Button";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { partnerAuthError } from "@/lib/partner-browser";
import type { PartnerDay } from "@/lib/partner-day";
import { plannerRequest } from "@/lib/partner-planner-browser";
import { partnerDirections, partnerPrivateVisitPath } from "@/lib/partner-planner";
import { workStatusLabels } from "@/lib/partner-workspace";

const dateLabel = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "UTC" });
const timeLabel = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const linkClass = "focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-blue";
const card = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 shadow-soft sm:p-5";

export default function PartnerDayPage() {
  const [workspace, setWorkspace] = useState<PartnerDay | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void plannerRequest("/api/partner/day", { signal: controller.signal }).then(result => {
      if (result && !controller.signal.aborted) { setWorkspace(result); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [revision]);

  return <AppShell compact>
    <header className="mb-4">
      <h1 className="text-3xl font-bold">Ma journée</h1>
      {workspace ? <p className="mt-1 capitalize">{dateLabel.format(new Date(workspace.day + "T00:00:00Z"))}</p> : null}
    </header>
    {!workspace && !error ? <p role="status">Chargement des rendez-vous…</p> : null}
    {error ? <div className="rounded-lg bg-red-50 p-3">
      <p role="alert" className="text-red-800">{error}</p>
      <Button type="button" variant="secondary" className="mt-2" onClick={() => setRevision(value => value + 1)}>Réessayer</Button>
    </div> : null}
    {workspace?.scope === "unlinked" ? <section className={card}>
      <p className="font-bold">Votre compte est en attente de rattachement au planning.</p>
      <p className="mt-1 text-sm">Le responsable de votre entreprise peut l’associer à votre ligne de technicien.</p>
    </section> : null}
    {workspace && workspace.scope !== "unlinked" ? <>
      {workspace.scope === "team" ? <div className="mb-3 flex flex-wrap items-center gap-3">
        <strong>Rendez-vous de l’équipe</strong>
        <ButtonLink variant="secondary" href="/partenaire/planning">Ouvrir le planning</ButtonLink>
      </div> : null}
      {workspace.appointments.length ? <ol className="grid gap-3">
        {workspace.appointments.map(item => {
          const phone = item.phone?.replace(/[^+\d]/g, "");
          const field = item.source === "sanispa" ? "/partenaire/interventions/" + item.id : partnerPrivateVisitPath(item.id);
          return <li key={item.source + item.id} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-bold text-sanispa-blue">{timeLabel.format(new Date(item.starts_at))} – {timeLabel.format(new Date(item.ends_at))}</p>
              <span className="rounded-md bg-sanispa-ice px-2 py-1 font-bold">{workStatusLabels[item.status]}</span>
            </div>
            <h2 className="mt-2 break-words text-lg font-bold">{item.customer}</h2>
            <p className="break-words">{item.title}{item.source === "sanispa" ? " · SANISPA" : ""}</p>
            {workspace.scope === "team" ? <p className="mt-1 break-words text-sm font-bold">{item.technician ?? "À affecter"}</p> : null}
            {item.address ? <p className="mt-1 break-words text-sm">{item.address}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {phone ? <a className={linkClass} href={"tel:" + phone}><Phone size={16} aria-hidden="true" />Appeler</a> : null}
              {item.address ? <a className={linkClass} href={partnerDirections(item.address)} target="_blank" rel="noreferrer">
                <MapPin size={16} aria-hidden="true" />Itinéraire
              </a> : null}
              <ButtonLink href={field}>Ouvrir la fiche terrain</ButtonLink>
            </div>
          </li>;
        })}
      </ol> : <p className={card}>Aucun rendez-vous prévu aujourd’hui.</p>}
      <Button type="button" variant="secondary" className="mt-3" onClick={() => setRevision(value => value + 1)}>Actualiser ma journée</Button>
    </> : null}
    <div className="mt-6"><PartnerNavigation current="Ma journée" /></div>
  </AppShell>;
}
