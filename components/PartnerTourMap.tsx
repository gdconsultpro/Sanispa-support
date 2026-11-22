"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { PartnerDrivingTour, type ApplyDrivingTour, type LoadDrivingTour } from "@/components/PartnerDrivingTour";
import { PartnerVisitUnplan } from "@/components/PartnerVisitUnplan";
import { nearbyPendingVisits, partnerDirections, plannerDate, plannerTime, suggestedTourStart,
  type PartnerMapPoint, type PendingPrivatePartnerVisit, type PlannerMapIntervention, type PlannerTechnician,
  type PlannerPeriod, type PrivatePartnerClient, type PrivatePartnerVisit, type TourBooking } from "@/lib/partner-planner";
import { matchesWorkFilters, workItemPath, workStatusLabels, type WorkFilterStatus } from "@/lib/partner-workspace";

const PrivateMap = dynamic(() => import("@/components/PartnerPrivateMap"), {
  ssr: false,
  loading: () => <p role="status" className="p-4">Chargement de la carte…</p>,
});

const filterClass = "focus-ring mt-1 min-h-12 w-full rounded-lg border border-sanispa-line bg-white px-3 text-base";
const linkClass = "focus-ring inline-flex min-h-11 items-center font-bold text-sanispa-blue underline";

export function PartnerTourMap({ items, team, period, scope, busy, onVisit, onAddress, onBook, loadRoute, applyTour, reloadTour, onNextAppointment, status, technician, highlightId, onUnplan }: {
  items: PlannerMapIntervention[] | null;
  team: PlannerTechnician[];
  period: PlannerPeriod;
  scope: string;
  busy: boolean;
  onVisit: (visit: PrivatePartnerVisit | PendingPrivatePartnerVisit) => void;
  onAddress: (client: PrivatePartnerClient) => void;
  onBook: (booking: TourBooking) => Promise<void>;
  loadRoute: LoadDrivingTour;
  applyTour: ApplyDrivingTour;
  reloadTour: () => void;
  onNextAppointment: (technician: string) => Promise<boolean>;
  status: WorkFilterStatus;
  technician: string;
  highlightId: string | null;
  onUnplan: (item: PlannerMapIntervention) => Promise<void>;
}) {
  const [showTour, setShowTour] = useState(false);
  const [lastMap, setLastMap] = useState<{ waiting: PlannerMapIntervention[]; team: PlannerTechnician[] } | null>(null);
  const [nextPending, setNextPending] = useState(false);
  const [nextMessage, setNextMessage] = useState("");
  const [selected, setSelected] = useState<{ id: string; scope: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; message: string } | null>(null);
  const visibleTeam = items ? team : lastMap?.team ?? team;
  const tourTechnician = visibleTeam.find(member => member.id === technician) ?? (visibleTeam.length === 1 ? visibleTeam[0] : undefined);
  const displayItems = items ?? (status === "pending" ? lastMap?.waiting ?? null : null);
  useEffect(() => {
    if (items) setLastMap({ waiting: items.filter(item => item.workStatus === "pending"), team });
  }, [items, team]);
  async function findNextAppointment() {
    setNextMessage("");
    setNextPending(true);
    try {
      if (!await onNextAppointment(technician)) setNextMessage("Aucun rendez-vous à venir pour cette sélection.");
    } catch (error) {
      setNextMessage(error instanceof Error ? error.message : "Le prochain rendez-vous est temporairement indisponible.");
    } finally {
      setNextPending(false);
    }
  }
  const panelScope = [period, scope, status, technician].join(":");
  const chooseAppointment = useCallback((id: string) => {
    setConfirmation(null);
    setSelected({ id, scope: panelScope });
  }, [panelScope]);
  const anchor = selected?.scope === panelScope
    ? displayItems?.find(item => item.id === selected.id && item.workStatus === "scheduled" && item.startsAt && item.endsAt) : undefined;
  const { entries, points } = useMemo(() => {
    const names = new Map(visibleTeam.map(member => [member.id, member.name]));
    const entries = (displayItems ?? []).filter(item => matchesWorkFilters(item, status, technician)).map(item => {
      const time = item.startsAt ? plannerTime(item.startsAt) : item.workStatus === "pending" ? "Sans date" : "";
      const day = item.activityAt && period !== "day"
        ? new Date(item.activityAt).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
        : "";
      const detail = [[day, time].filter(Boolean).join(" "), (item.technicianId && names.get(item.technicianId)) || "À affecter",
        item.workStatus && workStatusLabels[item.workStatus],
        item.dossierId ? "Dossier SANISPA" : "Mon entreprise",
        item.approximateLocation ? "Position approximative (commune)" : ""].filter(Boolean).join(" · ");
      return { ...item, detail };
    });
    if (highlightId) entries.sort((left, right) => Number(right.id === highlightId) - Number(left.id === highlightId));
    const points: PartnerMapPoint[] = entries.flatMap(item => item.latitude !== null && item.longitude !== null ? [{
      id: item.id, latitude: item.latitude, longitude: item.longitude, title: item.title,
      detail: item.detail, address: item.address, pending: item.workStatus === "pending", workStatus: item.workStatus,
      recordHref: workItemPath(item), highlighted: item.id === highlightId,
    }] : []);
    return { entries, points };
  }, [displayItems, highlightId, period, status, technician, visibleTeam]);
  const mappedIds = new Set(points.map(point => point.id));

  return <>
    <div className="mb-3 flex flex-wrap gap-x-5">
    <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-bold">
      <input type="checkbox" className="h-5 w-5 accent-sanispa-blue" checked={showTour} disabled={busy || nextPending}
        onChange={event => setShowTour(event.target.checked)} />
      Afficher la tournée
    </label>
    </div>
    {showTour ? <PartnerDrivingTour items={items} technician={tourTechnician} scope={scope} loadRoute={loadRoute}
      applyTour={applyTour} reloadTour={reloadTour} saving={busy} /> : <>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
      <p className="text-sm">{status === "pending" ? "Interventions sans créneau, toutes dates confondues."
        : status === "all" ? "Interventions de la période et file à planifier." : "Interventions de la période sélectionnée."}</p>
      <button type="button" className={linkClass + " text-sm"} disabled={busy || nextPending} onClick={() => void findNextAppointment()}>
        {nextPending ? "Recherche du prochain rendez-vous…" : "Aller au prochain rendez-vous"}
      </button>
    </div>
    {nextMessage ? <p role="status" className="mb-2 text-sm">{nextMessage}</p> : null}
    {displayItems ? <p className="mb-2 text-sm font-bold">
      {entries.length} {entries.length === 1 ? "intervention" : "interventions"}{status === "pending" ? " à planifier" : ""}
    </p> : null}
    <PrivateMap points={points} onAppointment={chooseAppointment} overview
      label={status === "pending" ? "Carte des interventions à planifier"
        : "Carte des interventions de la période"} />
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
      {entries.some(item => item.workStatus === "pending") ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> À planifier</span> : null}
      {entries.some(item => item.workStatus === "scheduled" || item.workStatus === "due" || item.workStatus === "in_progress") ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sanispa-blue" /> Rendez-vous</span> : null}
      {entries.some(item => item.workStatus === "review" || item.workStatus === "validated" || item.workStatus === "closed" || item.workStatus === "followup") ?
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-700" /> Historique et suivi</span> : null}
    </div>
    {displayItems && entries.length > points.length ? <p className="mt-2 text-sm text-sanispa-steel">
      {entries.length - points.length} {entries.length - points.length === 1 ? "intervention sans adresse localisée" : "interventions sans adresse localisée"}. Retrouvez-les dans la liste ci-dessous.
    </p> : null}
    {anchor && displayItems ? <NearbyInterventions key={anchor.id} anchor={anchor} items={displayItems}
      team={visibleTeam} busy={busy} confirmation={confirmation?.id === anchor.id ? confirmation.message : ""} onClose={() => setSelected(null)}
      onBook={async (booking, message) => {
        await onBook(booking);
        setConfirmation({ id: anchor.id, message });
      }} /> : null}
    {displayItems ? <section className="mt-4" aria-label="Interventions affichées">
      {!entries.length ? <p>{status === "scheduled" ? "Aucune intervention pour cette période et ces filtres." : "Aucune intervention pour ces filtres."}</p> : <ul className="divide-y divide-sanispa-line">
        {entries.map(item => <li key={item.id} className={item.id === highlightId ? "my-2 rounded-xl border border-sanispa-blue bg-sanispa-ice px-3 py-3" : "py-3"}>
          {item.id === highlightId ? <p className="text-sm font-bold text-sanispa-blue">Intervention sélectionnée</p> : null}
          <h3 className="break-words text-lg font-bold">{item.title}</h3>
          <p className="text-sm font-semibold">{item.detail}</p>
          <p className="break-words text-sm">{item.address || "Adresse à compléter"}</p>
          <div className="flex flex-wrap gap-x-4 text-sm">
            <Link className={linkClass} href={workItemPath(item)}>{item.workStatus === "review" && item.dossierId ? "Ouvrir le rapport" : "Ouvrir la fiche"}</Link>
            {item.visit && !item.reschedule?.closed ? <button type="button" disabled={busy} className={linkClass} onClick={() => item.visit && onVisit(item.visit)}>
              {item.startsAt ? "Modifier le rendez-vous" : "Fixer le rendez-vous"}
            </button> : null}
            {item.workStatus === "scheduled" && mappedIds.has(item.id) ? <button type="button" disabled={busy} className={linkClass}
              onClick={() => chooseAppointment(item.id)}>Interventions à proximité</button> : null}
            {item.workStatus === "scheduled" && item.startsAt && Date.parse(item.startsAt) > Date.now() ?
              <PartnerVisitUnplan disabled={busy} onUnplan={() => onUnplan(item)} /> : null}
            {item.client && (item.approximateLocation || !mappedIds.has(item.id)) ? <button type="button" disabled={busy} className={linkClass}
              onClick={() => item.client && onAddress(item.client)}>Compléter l’adresse</button> : null}
          </div>
        </li>)}
      </ul>}
    </section> : null}
    </>}
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
