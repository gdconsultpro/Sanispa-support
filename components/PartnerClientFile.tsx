"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { PartnerClientSpas } from "@/components/PartnerClientSpas";
import { PartnerVisitDelete } from "@/components/PartnerVisitDelete";
import { problemLabel } from "@/lib/display-labels";
import {
  partnerClientAddress, partnerPrivateVisitPath, partnerSpaOption,
  type PartnerClientHistory, type PartnerClientSpa,
} from "@/lib/partner-planner";

const sections = { contact: "Coordonnées", history: "Interventions passées", equipment: "Équipements" } as const;
const panel = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const action = "focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline";
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

export function PartnerClientFile({ history, offset, busy, loading, onPage, onEdit, onAdd, onAddress, onSpasChanged, onDeleteClient }: {
  history: PartnerClientHistory;
  offset: number;
  busy: boolean;
  loading: boolean;
  onPage: (offset: number) => void;
  onEdit: () => void;
  onAdd: (spa?: PartnerClientSpa) => void;
  onAddress: () => void;
  onSpasChanged: () => void;
  onDeleteClient: () => Promise<void>;
}) {
  const { client, visits, dossier, more, spas } = history;
  const [section, setSection] = useState<keyof typeof sections>("contact");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const address = partnerClientAddress(client);
  const pastDossier = offset === 0 ? dossier : null;
  const dossierDate = pastDossier?.intervened_at ?? pastDossier?.partner_appointments?.starts_at;

  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-bold text-sanispa-steel">Fiche contact client</p>
        <h2 ref={heading} tabIndex={-1} className="break-words text-2xl font-bold">{client.name}</h2>
      </div>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => onAdd()}>Nouvelle intervention</Button>
    </div>
    <nav aria-label="Rubriques de la fiche contact" className="flex flex-wrap gap-2">
      {Object.entries(sections).map(([value, label]) =>
        <Button key={value} type="button" variant={section === value ? "primary" : "secondary"}
          aria-pressed={section === value} disabled={busy} onClick={() => setSection(value as keyof typeof sections)}>{label}</Button>)}
    </nav>
    {section === "contact" ? <section className={panel} aria-labelledby="partner-client-coordinates">
      <h3 className="text-xl font-bold" id="partner-client-coordinates">Coordonnées</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2"><dt className="text-sm font-bold">Adresse</dt>
          <dd className="break-words">{address || "Adresse à compléter"}</dd></div>
        <div className="min-w-0"><dt className="text-sm font-bold">Téléphone</dt>
          <dd>{client.phone ? <a href={"tel:" + client.phone.replace(/[^+\d]/g, "")} className={action + " break-all"}>{client.phone}</a> : "Non renseigné"}</dd></div>
        <div className="min-w-0"><dt className="text-sm font-bold">E-mail</dt>
          <dd>{client.email ? <a href={"mailto:" + client.email} className={action + " break-all"}>{client.email}</a> : "Non renseigné"}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-4">
        <button type="button" className={action} disabled={busy} onClick={onEdit}>Modifier les coordonnées</button>
        {address ? <button type="button" className={action} disabled={busy} onClick={onAddress}>Voir l’adresse sur la carte</button> : null}
        <PartnerVisitDelete client disabled={busy} onDelete={onDeleteClient} />
      </div>
    </section> : null}
    {section === "equipment" ? <PartnerClientSpas clientId={client.id} spas={spas} busy={busy} onChange={onSpasChanged} onVisit={onAdd} /> : null}
    {section === "history" ? <section className={panel} aria-labelledby="partner-client-history">
      <h3 id="partner-client-history" className="text-xl font-bold">Interventions passées</h3>
      {loading ? <p role="status" className="mt-2">Chargement de l’historique…</p>
        : visits.length || pastDossier ? <ul className="mt-2 divide-y divide-sanispa-line">
          {pastDossier ? <li className="py-2">
            <h4 className="break-words font-bold">{problemLabel(pastDossier.problem_type)} · SANISPA</h4>
            {dossierDate ? <p className="text-sm">{date.format(new Date(dossierDate))}</p> : null}
            <Link className={action} href={"/partenaire/interventions/" + pastDossier.id}>Consulter le dossier SANISPA</Link>
          </li> : null}
          {visits.map(visit => {
            const spa = spas.find(item => item.id === visit.spa_id);
            return <li key={visit.id} className="py-2">
              <h4 className="break-words font-bold">{visit.title}</h4>
              {visit.starts_at ? <p className="text-sm">{date.format(new Date(visit.starts_at))}</p> : null}
              {spa ? <p className="break-words text-sm">{partnerSpaOption(spa)}</p> : null}
              <Link className={action} href={partnerPrivateVisitPath(visit.id)}>Consulter l’intervention passée</Link>
            </li>;
          })}
        </ul> : <p className="mt-2">Aucune intervention passée pour ce client.</p>}
      {!loading && (offset > 0 || more) ? <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || offset === 0} onClick={() => onPage(Math.max(0, offset - 30))}>Précédent</Button>
        <Button type="button" variant="secondary" disabled={busy || !more} onClick={() => onPage(offset + 30)}>Suivant</Button>
      </div> : null}
    </section> : null}
  </div>;
}
