"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { problemLabel } from "@/lib/display-labels";
import {
  partnerClientAddress, partnerClientDossierTiming, partnerClientHistoryFilters, partnerClientVisitTiming, plannerTime,
  type PartnerClientHistory, type PartnerClientHistoryFilter, type PartnerClientVisit,
} from "@/lib/partner-planner";

const timingLabels = { pending: "À planifier", scheduled: "À venir", past: "Passée" } as const;
const filterLabels = { all: "Toutes", ...timingLabels, past: "Passées" } as const;
const panel = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const action = "focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline";
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function dateLabel(start: string, end?: string | null) {
  const day = dateFormat.format(new Date(start));
  if (!end) return day;
  return day === dateFormat.format(new Date(end))
    ? `${day} · ${plannerTime(start)} – ${plannerTime(end)}`
    : `${day} à ${plannerTime(start)} – ${dateFormat.format(new Date(end))} à ${plannerTime(end)}`;
}

export function PartnerClientFile({ history, filter, offset, busy, loading, onFilter, onPage, onEdit, onAdd, onAddress, onVisit, onMap }: {
  history: PartnerClientHistory;
  filter: PartnerClientHistoryFilter;
  offset: number;
  busy: boolean;
  loading: boolean;
  onFilter: (filter: PartnerClientHistoryFilter) => void;
  onPage: (offset: number) => void;
  onEdit: () => void;
  onAdd: () => void;
  onAddress: () => void;
  onVisit: (visit: PartnerClientVisit) => void;
  onMap: (visit: PartnerClientVisit) => void;
}) {
  const { client, visits, dossier, technicians, more } = history;
  const name = useRef<HTMLHeadingElement>(null);
  const focusedClient = useRef<string | null>(null);
  useEffect(() => {
    if (focusedClient.current !== client.id) {
      name.current?.focus();
      focusedClient.current = client.id;
    }
  }, [client.id]);
  const address = partnerClientAddress(client);
  const now = Date.now();
  const dossierTiming = dossier ? partnerClientDossierTiming(dossier, now) : null;
  const showDossier = offset === 0 && dossier && (filter === "all" || filter === dossierTiming);
  const appointment = dossier?.partner_appointments;
  const technicianName = (id?: string | null) => technicians.find(person => person.id === id)?.name;

  return <div className="grid min-w-0 gap-4">
    <section className={panel} aria-labelledby="partner-client-name">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="partner-client-name" ref={name} tabIndex={-1} className="break-words text-2xl font-bold">{client.name}</h2>
          {address ? <p className="mt-1 break-words">{address}</p> : null}
          <div className="flex flex-wrap gap-x-4">
            {client.phone ? <a href={"tel:" + client.phone.replace(/[^+\d]/g, "")} className={action + " break-all"}>{client.phone}</a> : null}
            {client.email ? <a href={"mailto:" + client.email} className={action + " break-all"}>{client.email}</a> : null}
          </div>
          {client.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{client.description}</p> : null}
        </div>
        <Button type="button" disabled={busy} onClick={onAdd}>Nouvelle intervention</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4">
        <button type="button" className={action} disabled={busy} onClick={onEdit}>Modifier les coordonnées</button>
        {address ? <button type="button" className={action} disabled={busy} onClick={onAddress}>Voir l’adresse sur la carte</button> : null}
      </div>
    </section>
    <section className={panel} aria-labelledby="partner-client-history">
      <h2 id="partner-client-history" className="text-xl font-bold">Historique des interventions</h2>
      <div className="my-3 flex flex-wrap gap-2" aria-label="Filtrer les interventions du client">
        {partnerClientHistoryFilters.map(value => <Button key={value} type="button" variant={filter === value ? "primary" : "secondary"}
          aria-pressed={filter === value} disabled={busy} onClick={() => onFilter(value)}>{filterLabels[value]}</Button>)}
      </div>
      {loading ? <p role="status">Chargement des interventions…</p> : visits.length || showDossier ? <ul className="divide-y divide-sanispa-line">
        {showDossier && dossierTiming ? <li className="py-3">
          <p className="text-sm text-sanispa-steel">Dossier transmis par SANISPA</p>
          <h3 className="break-words font-bold">{problemLabel(dossier.problem_type)}</h3>
          <p className="text-sm">{dossier.status === "CLOSED" || dossier.status === "terminé" ? "Clôturé" : timingLabels[dossierTiming]}
            {appointment ? " · " + dateLabel(appointment.starts_at, appointment.ends_at) : dossier.intervened_at ? " · " + dateLabel(dossier.intervened_at) : ""}
            {technicianName(appointment?.technician_id) ? " · " + technicianName(appointment?.technician_id) : ""}</p>
          {dossier.preview_description ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{dossier.preview_description}</p> : null}
          <Link className={action} href={"/partenaire/interventions/" + dossier.id}>Ouvrir le dossier SANISPA</Link>
        </li> : null}
        {visits.map(visit => {
          const technician = technicianName(visit.technician_id);
          return <li key={visit.id} className="py-3">
            <h3 className="break-words font-bold">{visit.title}</h3>
            <p className="text-sm">{timingLabels[partnerClientVisitTiming(visit.ends_at, now)]}
              {visit.starts_at ? " · " + dateLabel(visit.starts_at, visit.ends_at) : ""}
              {technician ? " · " + technician : ""}</p>
            {visit.description ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{visit.description}</p> : null}
            <div className="flex flex-wrap gap-x-4">
              <button type="button" className={action} disabled={busy} onClick={() => onVisit(visit)}>Modifier l’intervention</button>
              {address ? <button type="button" className={action} disabled={busy} onClick={() => onMap(visit)}>Voir l’intervention sur la carte</button> : null}
            </div>
          </li>;
        })}
      </ul> : <p>{filter === "all" ? "Aucune intervention enregistrée pour ce client." : "Aucune intervention dans cette catégorie."}</p>}
      {!loading && (offset > 0 || more) ? <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || offset === 0} onClick={() => onPage(Math.max(0, offset - 30))}>Précédent</Button>
        <Button type="button" variant="secondary" disabled={busy || !more} onClick={() => onPage(offset + 30)}>Suivant</Button>
      </div> : null}
    </section>
  </div>;
}
