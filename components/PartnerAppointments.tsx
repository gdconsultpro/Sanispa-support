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

const emptyLabels = {
  today: "Aucun rendez-vous prévu aujourd’hui.",
  upcoming: "Aucune intervention à venir.",
  history: "Aucune intervention passée.",
};
type ScheduleView = keyof typeof emptyLabels;
const dateLabel = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" });
const timeLabel = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const linkClass = "focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-blue";
const card = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 shadow-soft sm:p-5";

export function PartnerAppointments({ personalSchedule = false }: { personalSchedule?: boolean }) {
  const [view, setView] = useState<ScheduleView>(personalSchedule ? "upcoming" : "today");
  const [cursor, setCursor] = useState<Pick<PartnerDay["appointments"][number], "starts_at" | "id"> | null>(null);
  const [workspace, setWorkspace] = useState<PartnerDay | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ view });
    if (cursor) {
      query.set("start", cursor.starts_at);
      query.set("id", cursor.id);
    }
    void plannerRequest("/api/partner/day?" + query, { signal: controller.signal }).then((result: PartnerDay | null) => {
      if (!result || controller.signal.aborted) return;
      setWorkspace(previous => cursor && previous
        ? { ...result, appointments: [...previous.appointments, ...result.appointments] } : result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(partnerAuthError(cause));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [view, cursor, revision]);

  function refresh(next = view) {
    setWorkspace(null);
    setCursor(null);
    setError("");
    setLoading(true);
    setView(next);
    setRevision(value => value + 1);
  }

  return <AppShell compact>
    {personalSchedule ? <PartnerNavigation current="Interventions" /> : null}
    <header className="mb-4">
      <h1 className="text-3xl font-bold">{personalSchedule ? "Mes interventions" : "Ma journée"}</h1>
      {!personalSchedule && workspace ? <p className="mt-1 capitalize">{dateLabel.format(new Date(workspace.day + "T00:00:00Z"))}</p> : null}
    </header>
    {personalSchedule ? <div className="mb-4 flex flex-wrap gap-2" aria-label="Période des interventions">
      <Button type="button" variant={view === "upcoming" ? "primary" : "secondary"} aria-pressed={view === "upcoming"} onClick={() => refresh("upcoming")}>À venir</Button>
      <Button type="button" variant={view === "history" ? "primary" : "secondary"} aria-pressed={view === "history"} onClick={() => refresh("history")}>Historique</Button>
    </div> : null}
    {!workspace && !error ? <p role="status">Chargement des rendez-vous…</p> : null}
    {error ? <div className="rounded-lg bg-red-50 p-3">
      <p role="alert" className="text-red-800">{error}</p>
      <Button type="button" variant="secondary" className="mt-2" onClick={() => {
        setError("");
        setLoading(true);
        setRevision(value => value + 1);
      }}>Réessayer</Button>
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
              <p className="font-bold text-sanispa-blue">{personalSchedule ? dateLabel.format(new Date(item.starts_at)) + " · " : ""}{timeLabel.format(new Date(item.starts_at))} – {timeLabel.format(new Date(item.ends_at))}</p>
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
      </ol> : <p className={card}>{emptyLabels[view]}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {workspace.more ? <Button type="button" variant="secondary" disabled={loading || Boolean(error)} onClick={() => {
          const last = workspace.appointments.at(-1);
          if (!last) return;
          setLoading(true);
          setCursor({ starts_at: last.starts_at, id: last.id });
        }}>{loading ? "Chargement…" : "Voir plus d’interventions"}</Button> : null}
        <Button type="button" variant="secondary" onClick={() => refresh()}>{personalSchedule ? "Actualiser mes interventions" : "Actualiser ma journée"}</Button>
      </div>
    </> : null}
    {!personalSchedule ? <div className="mt-6"><PartnerNavigation current="Ma journée" /></div> : null}
  </AppShell>;
}
