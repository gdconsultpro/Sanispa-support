"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { matchesPlannerMapFilters, plannerTime, type PartnerMapPoint, type PendingPrivatePartnerVisit,
  type PlannerMapIntervention, type PlannerTechnician, type PrivatePartnerClient, type PrivatePartnerVisit } from "@/lib/partner-planner";

const PrivateMap = dynamic(() => import("@/components/PartnerPrivateMap"), {
  ssr: false,
  loading: () => <p role="status" className="p-4">Chargement de la carte…</p>,
});

const filterClass = "focus-ring mt-1 min-h-12 w-full rounded-lg border border-sanispa-line bg-white px-3 text-base";
const linkClass = "focus-ring inline-flex min-h-11 items-center font-bold text-sanispa-blue underline";

export function PartnerTourMap({ items, team, period, busy, onVisit, onAddress }: {
  items: PlannerMapIntervention[] | null;
  team: PlannerTechnician[];
  period: "day" | "week";
  busy: boolean;
  onVisit: (visit: PrivatePartnerVisit | PendingPrivatePartnerVisit) => void;
  onAddress: (client: PrivatePartnerClient) => void;
}) {
  const [status, setStatus] = useState<"all" | "scheduled" | "pending">("all");
  const [technician, setTechnician] = useState("all");
  const filterId = useId();
  const { entries, points } = useMemo(() => {
    const names = new Map(team.map(member => [member.id, member.name]));
    const entries = (items ?? []).filter(item => matchesPlannerMapFilters(item, status, technician)).map(item => {
      const time = item.startsAt ? plannerTime(item.startsAt) : "À planifier · Sans date";
      const day = item.startsAt && period === "week"
        ? new Date(item.startsAt).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
        : "";
      const detail = [[day, time].filter(Boolean).join(" "), (item.technicianId && names.get(item.technicianId)) || "À affecter"].join(" · ");
      return { ...item, detail };
    });
    const points: PartnerMapPoint[] = entries.flatMap(item => item.latitude !== null && item.longitude !== null ? [{
      id: item.id, latitude: item.latitude, longitude: item.longitude, title: item.title,
      detail: item.detail, address: item.address, pending: item.startsAt === null,
    }] : []);
    return { entries, points };
  }, [items, period, status, technician, team]);
  const mappedIds = new Set(points.map(point => point.id));

  return <>
    <div className="mb-3 grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={filterId + "-technician"} className="text-sm font-bold">Technicien</label>
        <select id={filterId + "-technician"} className={filterClass} value={technician} onChange={event => setTechnician(event.target.value)}>
          <option value="all">Toute l’équipe</option>
          <option value="">À affecter</option>
          {team.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={filterId + "-status"} className="text-sm font-bold">Statut</label>
        <select id={filterId + "-status"} className={filterClass} value={status} onChange={event => setStatus(event.target.value as typeof status)}>
          <option value="all">Toutes les interventions</option>
          <option value="scheduled">Planifiées</option>
          <option value="pending">À planifier</option>
        </select>
      </div>
    </div>
    <PrivateMap points={points} label={period === "week" ? "Carte des interventions de la semaine" : "Carte des interventions du jour"} />
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
      {status !== "pending" ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sanispa-blue" /> Planifiées</span> : null}
      {status !== "scheduled" ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> À planifier, sans date</span> : null}
    </div>
    {items && entries.length > points.length ? <p className="mt-2 text-sm text-sanispa-steel">
      {entries.length - points.length} {entries.length - points.length === 1 ? "intervention sans adresse localisée" : "interventions sans adresse localisée"}. Retrouvez-les dans la liste ci-dessous.
    </p> : null}
    {items ? <section className="mt-4" aria-label="Interventions affichées">
      {!entries.length ? <p>Aucune intervention pour cette période et ces filtres.</p> : <ul className="divide-y divide-sanispa-line">
        {entries.map(item => <li key={item.id} className="py-3">
          <h3 className="break-words text-lg font-bold">{item.title}</h3>
          <p className="text-sm font-semibold">{item.detail}</p>
          <p className="break-words text-sm">{item.address || "Adresse à compléter"}</p>
          <div className="flex flex-wrap gap-x-4 text-sm">
            {item.visit ? <button type="button" disabled={busy} className={linkClass} onClick={() => item.visit && onVisit(item.visit)}>
              {item.startsAt ? "Modifier le rendez-vous" : "Fixer le rendez-vous"}
            </button> : null}
            {item.client && !mappedIds.has(item.id) ? <button type="button" disabled={busy} className={linkClass} onClick={() => item.client && onAddress(item.client)}>Compléter l’adresse</button> : null}
            {item.dossierId ? <Link className={linkClass} href={"/partenaire/interventions/" + item.dossierId + (item.startsAt ? "" : "#rendez-vous")}>
              {item.startsAt ? "Ouvrir le dossier SANISPA" : "Planifier dans le dossier SANISPA"}
            </Link> : null}
          </div>
        </li>)}
      </ul>}
    </section> : null}
  </>;
}
