"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { matchesPlannerMapFilters, nearbyPendingVisits, partnerDirections, plannerDate, plannerTime, suggestedTourStart,
  type PartnerMapPoint, type PendingPrivatePartnerVisit, type PlannerMapIntervention, type PlannerTechnician,
  type PrivatePartnerClient, type PrivatePartnerVisit, type TourBooking } from "@/lib/partner-planner";

const PrivateMap = dynamic(() => import("@/components/PartnerPrivateMap"), {
  ssr: false,
  loading: () => <p role="status" className="p-4">Chargement de la carte…</p>,
});

const filterClass = "focus-ring mt-1 min-h-12 w-full rounded-lg border border-sanispa-line bg-white px-3 text-base";
const linkClass = "focus-ring inline-flex min-h-11 items-center font-bold text-sanispa-blue underline";

export function PartnerTourMap({ items, team, period, scope, busy, onVisit, onAddress, onBook }: {
  items: PlannerMapIntervention[] | null;
  team: PlannerTechnician[];
  period: "day" | "week";
  scope: string;
  busy: boolean;
  onVisit: (visit: PrivatePartnerVisit | PendingPrivatePartnerVisit) => void;
  onAddress: (client: PrivatePartnerClient) => void;
  onBook: (booking: TourBooking) => Promise<void>;
}) {
  const [status, setStatus] = useState<"all" | "scheduled" | "pending">("all");
  const [technician, setTechnician] = useState("all");
  const [selected, setSelected] = useState<{ id: string; scope: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; message: string } | null>(null);
  const filterId = useId();
  const panelScope = period + ":" + scope;
  const chooseAppointment = useCallback((id: string) => {
    setConfirmation(null);
    setSelected({ id, scope: panelScope });
  }, [panelScope]);
  const anchor = selected?.scope === panelScope
    ? items?.find(item => item.id === selected.id && item.startsAt && item.endsAt) : undefined;
  const { entries, points } = useMemo(() => {
    const names = new Map(team.map(member => [member.id, member.name]));
    const entries = (items ?? []).filter(item => matchesPlannerMapFilters(item, status, technician)).map(item => {
      const time = item.startsAt ? plannerTime(item.startsAt) : "À planifier · Sans date";
      const day = item.startsAt && period === "week"
        ? new Date(item.startsAt).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
        : "";
      const detail = [[day, time].filter(Boolean).join(" "), (item.technicianId && names.get(item.technicianId)) || "À affecter",
        item.approximateLocation ? "Position approximative (commune)" : ""].filter(Boolean).join(" · ");
      return { ...item, detail };
    });
    const points: PartnerMapPoint[] = entries.flatMap(item => item.latitude !== null && item.longitude !== null ? [{
      id: item.id, latitude: item.latitude, longitude: item.longitude, title: item.title,
      detail: item.detail, address: item.address, pending: item.startsAt === null,
    }] : []);
    return { entries, points };
  }, [items, period, status, technician, team]);
  const mappedIds = new Set(points.map(point => point.id));
  const waitingCount = entries.filter(item => !item.startsAt).length;

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
    {items && status !== "scheduled" ? <p className="mb-2 text-sm font-bold">
      {waitingCount} {waitingCount === 1 ? "intervention à planifier" : "interventions à planifier"}
    </p> : null}
    <PrivateMap points={points} onAppointment={chooseAppointment}
      label={period === "week" ? "Carte des interventions de la semaine" : "Carte des interventions du jour"} />
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
      {status !== "pending" ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sanispa-blue" /> Planifiées</span> : null}
      {status !== "scheduled" ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> À planifier, sans date</span> : null}
    </div>
    {items && entries.length > points.length ? <p className="mt-2 text-sm text-sanispa-steel">
      {entries.length - points.length} {entries.length - points.length === 1 ? "intervention sans adresse localisée" : "interventions sans adresse localisée"}. Retrouvez-les dans la liste ci-dessous.
    </p> : null}
    {anchor && items ? <NearbyInterventions key={anchor.id} anchor={anchor} items={items}
      team={team} busy={busy} confirmation={confirmation?.id === anchor.id ? confirmation.message : ""} onClose={() => setSelected(null)}
      onBook={async (booking, message) => {
        await onBook(booking);
        setConfirmation({ id: anchor.id, message });
      }} /> : null}
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
            {item.startsAt && mappedIds.has(item.id) ? <button type="button" disabled={busy} className={linkClass}
              onClick={() => chooseAppointment(item.id)}>Interventions à proximité</button> : null}
            {item.client && (item.approximateLocation || !mappedIds.has(item.id)) ? <button type="button" disabled={busy} className={linkClass}
              onClick={() => item.client && onAddress(item.client)}>Compléter l’adresse</button> : null}
            {item.dossierId ? <Link className={linkClass} href={"/partenaire/interventions/" + item.dossierId + (item.startsAt ? "" : "#rendez-vous")}>
              {item.startsAt ? "Ouvrir le dossier SANISPA" : "Planifier dans le dossier SANISPA"}
            </Link> : null}
          </div>
        </li>)}
      </ul>}
    </section> : null}
  </>;
}

const distanceLabel = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, style: "unit", unit: "kilometer" });
const dateLabel = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function NearbyInterventions({ anchor, items, team, busy, confirmation, onClose, onBook }: {
  anchor: PlannerMapIntervention; items: PlannerMapIntervention[]; team: PlannerTechnician[]; busy: boolean;
  confirmation: string; onClose: () => void; onBook: (booking: TourBooking, message: string) => Promise<void>;
}) {
  const [radius, setRadius] = useState(25);
  const [choosing, setChoosing] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const candidates = useMemo(() => nearbyPendingVisits(anchor, items, radius), [anchor, items, radius]);
  const technician = team.find(member => member.id === anchor.technicianId);
  useEffect(() => { heading.current?.focus(); }, []);

  return <section aria-labelledby={headingId} className="mt-4 rounded-xl border border-sanispa-line bg-sanispa-ice p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-x-4">
      <div className="min-w-0">
        <h3 id={headingId} ref={heading} tabIndex={-1} className="scroll-mt-4 text-lg font-bold">Interventions à planifier à proximité</h3>
        <p className="break-words text-sm font-bold">{anchor.title}</p>
        <p className="text-sm">{dateLabel.format(new Date(anchor.startsAt!))} à {plannerTime(anchor.startsAt!)} · {technician?.name ?? "À affecter"}</p>
        {anchor.approximateLocation ? <p className="text-sm text-sanispa-steel">Position approximative (commune)</p> : null}
        {anchor.address ? <a href={partnerDirections(anchor.address)} target="_blank" rel="noreferrer" className={linkClass + " break-words text-sm"}>
          {anchor.address} · Itinéraire
        </a> : null}
      </div>
      <button type="button" disabled={busy} className={linkClass + " text-sm"} onClick={onClose}>Fermer les suggestions</button>
    </div>
    {confirmation ? <p role="status" className="my-2 break-words rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{confirmation}</p> : null}
    <label className="my-2 block max-w-xs text-sm font-bold">Rayon autour du rendez-vous
      <select value={radius} className={filterClass} disabled={busy} onChange={event => {
        setRadius(Number(event.target.value));
        setChoosing(null);
      }}>
        {[10, 25, 50, 100].map(km => <option value={km} key={km}>{distanceLabel.format(km)}</option>)}
      </select>
    </label>
    <p className="text-sm">Distances à vol d’oiseau. {technician ? `Visites de ${technician.name} et visites à affecter.` : "Toutes les visites en attente dans ce rayon."}</p>
    {!candidates.length ? <p className="mt-3 text-sm font-semibold">Aucune intervention à planifier dans ce rayon.</p> : <ul className="mt-3 divide-y divide-sanispa-line rounded-xl bg-white px-3">
      {candidates.map(({ item, distance }) => <li key={item.id} className="py-3">
        <p className="break-words font-bold">{item.title}</p>
        <p className="break-words text-sm">{distanceLabel.format(distance)} · {item.address}</p>
        {item.approximateLocation ? <p className="text-sm text-sanispa-steel">Position approximative (commune)</p> : null}
        {choosing === item.id
          ? <TourBookingForm item={item} anchor={anchor} items={items} team={team} busy={busy} onCancel={() => setChoosing(null)}
            onBook={async (booking, message) => { await onBook(booking, message); setChoosing(null); }} />
          : <button type="button" disabled={busy} className={linkClass + " text-sm"} onClick={() => setChoosing(item.id)}>Ajouter à la tournée</button>}
      </li>)}
    </ul>}
  </section>;
}

function TourBookingForm({ item, anchor, items, team, busy, onBook, onCancel }: {
  item: PlannerMapIntervention; anchor: PlannerMapIntervention; items: PlannerMapIntervention[]; team: PlannerTechnician[]; busy: boolean;
  onBook: (booking: TourBooking, message: string) => Promise<void>; onCancel: () => void;
}) {
  const fixedTechnician = team.find(member => member.id === (anchor.technicianId ?? item.technicianId));
  const [suggested] = useState(() => suggestedTourStart(anchor.endsAt!, items.flatMap(visit =>
    fixedTechnician?.id === visit.technicianId && visit.startsAt && visit.endsAt
      ? [{ startsAt: visit.startsAt, endsAt: visit.endsAt }] : [])));
  const [error, setError] = useState("");
  const pending = useRef(false);
  const dayInput = useRef<HTMLInputElement>(null);
  useEffect(() => { dayInput.current?.focus(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pending.current) return;
    const values = new FormData(event.currentTarget);
    const start = new Date(`${values.get("date")}T${values.get("start")}`);
    const duration = Number(values.get("duration"));
    const technician = fixedTechnician ?? team.find(member => member.id === values.get("technician"));
    const id = item.visit?.id ?? item.dossierId;
    if (!id || !technician || !Number.isFinite(+start) || !Number.isInteger(duration) || duration < 1 || duration > 720) {
      setError("Renseignez le jour, l’heure, la durée et le technicien.");
      return;
    }
    setError("");
    pending.current = true;
    try {
      await onBook({
        source: item.visit ? "private" : "sanispa", id, expected_at: item.visit?.updated_at ?? null,
        starts_at: start.toISOString(), ends_at: new Date(+start + duration * 60000).toISOString(), technician_id: technician.id,
      }, `${item.title} a été ajouté à la tournée de ${technician.name} le ${dateLabel.format(start)} à ${plannerTime(start.toISOString())}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le rendez-vous n’a pas pu être ajouté. Réessayez.");
    } finally {
      pending.current = false;
    }
  }
  return <form onSubmit={submit} className="mt-2 min-w-0 rounded-lg border border-sanispa-line p-3">
    <fieldset disabled={busy} className="grid min-w-0 gap-2 sm:grid-cols-3">
      <label className="min-w-0 text-sm font-bold">Jour du rendez-vous
        <input ref={dayInput} type="date" name="date" defaultValue={plannerDate(suggested)} required className={filterClass + " min-w-0"} />
      </label>
      <label className="min-w-0 text-sm font-bold">Heure de début
        <input type="time" name="start" defaultValue={plannerTime(suggested.toISOString())} required className={filterClass + " min-w-0"} />
      </label>
      <label className="min-w-0 text-sm font-bold">Durée en minutes
        <input type="number" name="duration" min={1} max={720} defaultValue={60} required className={filterClass + " min-w-0"} />
      </label>
      {fixedTechnician ? <p className="text-sm font-bold sm:col-span-3">Technicien · {fixedTechnician.name}</p>
        : <label className="min-w-0 text-sm font-bold sm:col-span-3">Technicien de la tournée
          <select name="technician" required defaultValue="" className={filterClass + " min-w-0"}>
            <option value="">Choisir le technicien</option>
            {team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>}
      {error ? <p role="alert" className="text-sm font-bold text-red-700 sm:col-span-3">{error}</p> : null}
      <div className="mt-1 flex flex-wrap gap-2 sm:col-span-3">
        <Button type="submit" disabled={!team.length}>{busy ? "Enregistrement…" : "Confirmer le rendez-vous"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
      </div>
      {!team.length ? <p className="text-sm sm:col-span-3">Ajoutez un technicien depuis l’agenda pour créer une tournée.</p> : null}
    </fieldset>
  </form>;
}
