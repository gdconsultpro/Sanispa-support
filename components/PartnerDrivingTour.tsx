"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { plannerDate, plannerDay, plannerTime, type MapCoordinate, type PartnerMapPoint, type PlannerMapIntervention, type PlannerTechnician } from "@/lib/partner-planner";
import { isFixedTourStop, maximumTourRouteStops, minutesMissingBetweenStops, moveTourStep, orderTourStops, proposeTourTimes, scheduledTechnicianDays, tourCoordinate, tourDuration,
  type TourApplyResult, type TourDrivingRoute, type TourOrder, type TourReschedule, type TourStop } from "@/lib/partner-tour-routing";

const PrivateMap = dynamic(() => import("@/components/PartnerPrivateMap"), {
  ssr: false,
  loading: () => <p role="status">Chargement de la carte…</p>,
});
const dayFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" });
const emptyStops: TourStop[] = [];
const filterClass = "focus-ring mt-1 min-h-12 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-3 text-base";

export type LoadDrivingTour = (stops: (MapCoordinate | null)[], signal: AbortSignal) => Promise<TourDrivingRoute>;
export type ApplyDrivingTour = (tour: TourReschedule) => Promise<TourApplyResult>;
type TourDraft = { stops: TourStop[]; firstTime: string; now: number };

export function PartnerDrivingTour({ items, technician, scope, loadRoute, applyTour, reloadTour, saving }: {
  items: PlannerMapIntervention[] | null;
  technician: PlannerTechnician | undefined;
  scope: string;
  loadRoute: LoadDrivingTour;
  applyTour: ApplyDrivingTour;
  reloadTour: () => void;
  saving: boolean;
}) {
  const [chosenDay, setChosenDay] = useState("");
  const [order, setOrder] = useState<TourOrder>("schedule");
  const [editing, setEditing] = useState<{ key: string; draft: TourDraft } | null>(null);
  const id = useId();
  const days = useMemo(() => items && technician ? scheduledTechnicianDays(items, technician.id) : new Map<string, TourStop[]>(), [items, technician]);
  const dates = [...days.keys()].sort();
  const day = days.has(chosenDay) ? chosenDay : days.has(scope) ? scope : dates[0];
  const scheduled = days.get(day) ?? emptyStops;
  const stops = useMemo(() => orderTourStops(scheduled, order), [scheduled, order]);
  const routeKey = (technician?.id ?? "") + ":" + (day ?? "");
  const draft = editing?.key === routeKey ? editing.draft : null;

  return <section aria-label="Tournée du technicien">
    {!items ? <p role="status">Chargement du planning…</p>
      : !technician ? <p>Choisissez un technicien pour afficher sa tournée.</p>
      : !day ? <p>Aucun rendez-vous planifié pour {technician.name} sur cette période.</p> : <>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={id + "-day"} className="text-sm font-bold">Jour de tournée</label>
            <select id={id + "-day"} value={day} disabled={Boolean(draft) || saving}
              onChange={event => { setEditing(null); setChosenDay(event.target.value); }} className={filterClass}>
              {dates.map(date => <option key={date} value={date}>{dayFormat.format(plannerDay(date))}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={id + "-order"} className="text-sm font-bold">Ordre de passage</label>
            <select id={id + "-order"} value={order} disabled={Boolean(draft) || saving}
              onChange={event => setOrder(event.target.value as TourOrder)} className={filterClass}>
              <option value="schedule">Selon les horaires prévus</option>
              <option value="proximity">Par proximité</option>
            </select>
          </div>
        </div>
        {order === "proximity" && !draft ? <p className="mb-3 text-sm">La première étape reste fixe. Chaque étape suivante est choisie par proximité géographique. Vérifiez sa compatibilité avec les horaires prévus.</p> : null}
      </>}
    <DrivingTourMap key={routeKey} stops={draft?.stops ?? stops} scheduled={scheduled} draft={draft} saving={saving}
      day={day} technician={technician} loadRoute={loadRoute} applyTour={applyTour} reloadTour={reloadTour}
      onDraft={next => setEditing(next ? { key: routeKey, draft: next } : null)}
      onApplied={() => { setEditing(null); setOrder("schedule"); }} />
  </section>;
}

function DrivingTourMap({ stops, scheduled, draft, saving, day, technician, loadRoute, applyTour, reloadTour, onDraft, onApplied }: {
  stops: TourStop[]; scheduled: TourStop[]; draft: TourDraft | null; saving: boolean; day?: string; technician?: PlannerTechnician;
  loadRoute: LoadDrivingTour; applyTour: ApplyDrivingTour; reloadTour: () => void;
  onDraft: (draft: TourDraft | null) => void; onApplied: () => void;
}) {
  const [result, setResult] = useState<{ key: string; route?: TourDrivingRoute; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const [manualMinutes, setManualMinutes] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [notifyClients, setNotifyClients] = useState(false);
  const applying = useRef(false);
  const cache = useRef(new Map<string, TourDrivingRoute>());
  const isEditing = Boolean(draft);
  const coordinates = useMemo(() => stops.map(tourCoordinate), [stops]);
  const canCalculate = coordinates.some((point, index) => point && coordinates[index + 1]);
  const overLimit = stops.length > maximumTourRouteStops;
  const requestKey = canCalculate && !overLimit ? JSON.stringify(coordinates) : "";
  const activeKey = requestKey + ":" + attempt;
  const visible = result?.key === activeKey ? result : undefined;
  const route = visible?.route;

  useEffect(() => {
    if (!requestKey) return;
    const cached = cache.current.get(requestKey);
    if (cached) {
      setResult({ key: activeKey, route: cached });
      return;
    }
    const controller = new AbortController();
    const points: (MapCoordinate | null)[] = JSON.parse(requestKey);
    const timer = window.setTimeout(() => { void loadRoute(points, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      if (response.legs.every((leg, index) => leg || !points[index] || !points[index + 1])) {
        if (cache.current.size >= 12) cache.current.clear();
        cache.current.set(requestKey, response);
      }
      setResult({ key: activeKey, route: response });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key: activeKey, error: error instanceof Error ? error.message : "Calcul du trajet indisponible." });
    }); }, isEditing ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeKey, requestKey, loadRoute, isEditing]);
  const busy = Boolean(requestKey && !visible);
  const hasFailedLegs = route?.legs.some((leg, index) => !leg && coordinates[index] && coordinates[index + 1]);
  const calculated = route?.legs.flatMap(leg => leg ?? []) ?? [];
  const now = draft?.now ?? Date.now();
  const firstStart = draft ? +new Date(`${day}T${draft.firstTime}`) : NaN;
  const legKeys = useMemo(() => stops.slice(1).map((stop, index) => stops[index].id + "→" + stop.id), [stops]);
  const travelMinutes = useMemo(() => legKeys.map((key, index) => {
    const leg = route?.legs[index];
    if (leg) return Math.ceil(leg.seconds / 60);
    const minutes = manualMinutes[key];
    return /^\d{1,4}$/.test(minutes ?? "") && Number(minutes) <= 1440 ? Number(minutes) : null;
  }), [legKeys, manualMinutes, route]);
  const preview = useMemo(() => isEditing ? proposeTourTimes(stops, travelMinutes, firstStart, now) : null,
    [isEditing, stops, travelMinutes, firstStart, now]);
  const points = useMemo<PartnerMapPoint[]>(() => stops.flatMap((stop, index) => {
    const coordinate = coordinates[index];
    const proposed = preview?.[index];
    const time = proposed && !proposed.fixed && proposed.startsAt !== null
      ? "Proposé · " + plannerTime(new Date(proposed.startsAt).toISOString()) : plannerTime(stop.startsAt);
    return coordinate ? [{ ...coordinate, id: stop.id, title: stop.title, address: stop.address, step: index + 1,
      detail: time + (stop.approximateLocation ? " · Position approximative (commune)" : "") }] : [];
  }), [stops, coordinates, preview]);
  const outsideDay = preview?.some(visit => visit.startsAt !== null && plannerDate(new Date(visit.startsAt)) !== day);
  const movedToPast = preview?.some(visit => !visit.fixed && visit.startsAt !== null && visit.startsAt <= now);
  const lockedConflict = preview?.some(visit => visit.missesFixedTime);
  const changedCount = preview?.filter((visit, index) => visit.startsAt !== null && visit.startsAt !== Date.parse(stops[index].startsAt)).length ?? 0;
  const incomplete = !preview || preview.some(visit => visit.startsAt === null);
  const canSave = !busy && !saving && !outsideDay && !movedToPast && !lockedConflict && !incomplete && changedCount > 0 && !saveError?.stale;
  const canEdit = !overLimit && scheduled.some(stop => !isFixedTourStop(stop, now)) && scheduled.every(stop => stop.reschedule);

  function startEditing() {
    const now = Date.now();
    const chronological = orderTourStops(scheduled, "schedule");
    const first = chronological.find(stop => !isFixedTourStop(stop, now));
    if (!first) return;
    const movable = stops.filter(stop => !isFixedTourStop(stop, now));
    let index = 0;
    const ordered = chronological.map(stop => isFixedTourStop(stop, now) ? stop : movable[index++]);
    setManualMinutes({});
    setNotifyClients(false);
    setSaveError(null);
    setSavedMessage("");
    onDraft({ stops: ordered, firstTime: plannerTime(first.startsAt), now });
  }

  async function saveTour() {
    if (!canSave || applying.current || !day || !technician || !preview) return;
    const shifted = preview.flatMap((visit, index) => {
      const stop = stops[index];
      const source = stop.reschedule;
      if (!source || visit.startsAt === null) return [];
      const starts_at = visit.startsAt === Date.parse(stop.startsAt) ? stop.startsAt : new Date(visit.startsAt).toISOString();
      return [{ source: source.source, id: source.id, expected_at: source.version, starts_at }];
    });
    if (shifted.length !== stops.length) return;
    applying.current = true;
    setSaveError(null);
    try {
      const { updated, queued, without_email } = await applyTour({ day, technician_id: technician.id, stops: shifted, notify_clients: notifyClients });
      setSavedMessage([
        updated === 1 ? "Tournée validée. Un horaire a été mis à jour dans le planning."
          : `Tournée validée. ${updated} horaires ont été mis à jour dans le planning.`,
        queued > 0 ? `${queued} ${queued === 1 ? "e-mail en cours d’envoi" : "e-mails en cours d’envoi"}.` : "",
        without_email > 0 ? `${without_email} rendez-vous sans adresse e-mail disponible.` : "",
      ].filter(Boolean).join(" "));
      onApplied();
    } catch (error) {
      setSaveError({ message: error instanceof Error ? error.message : "La tournée n’a pas pu être validée.",
        stale: error instanceof Error && "code" in error && error.code === "TOUR_CHANGED" });
    } finally {
      applying.current = false;
    }
  }

  return <>
    {savedMessage ? <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{savedMessage}</p> : null}
    {draft ? <div className="mb-3 rounded-xl bg-sanispa-ice p-3 text-sm">
      <p className="font-bold">Aperçu des nouveaux horaires</p>
      <p>Déplacez les étapes avec les flèches. Les horaires proposés incluent les trajets et conservent la durée des rendez-vous.</p>
      <label className="mt-2 block max-w-xs font-bold">Heure du premier rendez-vous modifiable
        <input type="time" className={filterClass} value={draft.firstTime} disabled={saving}
          onChange={event => onDraft({ ...draft, firstTime: event.target.value })} />
      </label>
    </div> : canEdit ? <Button type="button" variant="secondary" className="mb-3" disabled={saving} onClick={startEditing}>Modifier la tournée</Button> : null}
    <PrivateMap points={points} routeLines={route?.lines} label={technician ? "Carte de la tournée de " + technician.name : "Carte de la tournée"} />
    {busy ? <p role="status" className="mt-2 text-sm">Calcul des trajets routiers…</p> : null}
    {overLimit ? <p className="mt-2 text-sm">Le calcul routier est disponible jusqu’à {maximumTourRouteStops} étapes par tournée.</p> : null}
    {visible?.error || hasFailedLegs ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <p role="status">{visible?.error || "Certains trajets routiers sont indisponibles."}</p>
      <Button type="button" variant="secondary" onClick={() => setAttempt(value => value + 1)}>Recalculer</Button>
    </div> : null}
    {stops.length ? <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{stops.length} {stops.length === 1 ? "étape" : "étapes"}</h3>
        {calculated.length ? <p className="text-sm font-bold">
          {calculated.length === stops.length - 1 ? "Temps de conduite estimé" : "Temps des trajets calculés"} · {tourDuration(calculated.reduce((sum, leg) => sum + leg.seconds, 0))}
        </p> : null}
      </div>
      {calculated.length ? <p className="text-sm text-sanispa-steel">Durées estimées sans trafic en temps réel.</p> : null}
      <ol className="mt-2 divide-y divide-sanispa-line" aria-label="Étapes de la tournée">
        {stops.map((stop, index) => {
          const previous = stops[index - 1];
          const leg = route?.legs[index - 1] ?? null;
          const missingMinutes = previous ? minutesMissingBetweenStops(previous, stop, leg) : 0;
          const approximate = previous?.approximateLocation || stop.approximateLocation;
          const outOfOrder = previous && Date.parse(stop.startsAt) < Date.parse(previous.startsAt);
          const proposed = preview?.[index];
          const up = draft && moveTourStep(stops, index, -1, now);
          const down = draft && moveTourStep(stops, index, 1, now);
          const manualKey = legKeys[index - 1];
          return <li key={stop.id} className="py-3">
            {previous ? <div className="mb-2 text-sm font-semibold">
              {leg ? <>Trajet depuis l’étape {index} · {tourDuration(leg.seconds)}{approximate ? " · Position approximative" : ""}</>
                : !busy && draft && (!proposed?.fixed || !preview?.[index - 1].fixed) ? <label className="block max-w-xs">
                  Trajet vers l’étape {index + 1} (minutes)
                  <input className={filterClass} type="number" min="0" max="1440" inputMode="numeric" disabled={saving}
                    value={manualMinutes[manualKey] ?? ""} onChange={event => {
                      const value = event.target.value;
                      setManualMinutes(current => ({ ...current, [manualKey]: value }));
                    }} />
                </label> : !busy ? <>Trajet depuis l’étape {index} · {!coordinates[index - 1] || !coordinates[index] ? "adresse à localiser" : "durée indisponible"}</> : null}
              {!draft && outOfOrder ? <p className="text-amber-900">Cet ordre inverse deux rendez-vous. Horaires à revoir.</p>
                : !draft && missingMinutes > 0 ? <p className="text-amber-900">{leg ? `Prévoyez ${missingMinutes} min de plus entre ces rendez-vous.` : "Les horaires de ces rendez-vous se chevauchent."}</p> : null}
            </div> : null}
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-sanispa-blue px-1 text-sm font-bold text-white">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <h4 className="break-words font-bold">{stop.title}</h4>
                <p className="text-sm font-bold">{draft ? "Planning actuel · " : ""}{plannerTime(stop.startsAt)} – {plannerTime(stop.endsAt)}</p>
                {proposed ? <p className="text-sm font-bold text-sanispa-blue">
                  {proposed.fixed ? "Horaire verrouillé"
                    : proposed.startsAt !== null && proposed.endsAt !== null
                      ? `Proposé · ${plannerTime(new Date(proposed.startsAt).toISOString())} – ${plannerTime(new Date(proposed.endsAt).toISOString())}`
                      : "Horaire proposé en attente"}
                </p> : null}
                <p className="break-words text-sm">{stop.address || "Adresse à compléter"}</p>
                {stop.approximateLocation ? <p className="text-sm text-sanispa-steel">Position approximative (commune)</p> : null}
              </div>
              {draft && !proposed?.fixed && up && down ? <div className="flex flex-col gap-1 sm:flex-row">
                <Button type="button" variant="secondary" aria-label={`Monter l’étape ${index + 1}`}
                  disabled={saving || up === stops} onClick={() => onDraft({ ...draft, stops: up })}>↑</Button>
                <Button type="button" variant="secondary" aria-label={`Descendre l’étape ${index + 1}`}
                  disabled={saving || down === stops} onClick={() => onDraft({ ...draft, stops: down })}>↓</Button>
              </div> : null}
            </div>
          </li>;
        })}
      </ol>
      {draft ? <div className="sticky bottom-0 z-10 mt-3 rounded-xl border border-sanispa-line bg-white p-3 shadow-soft">
        {outsideDay ? <p role="status" className="mb-2 text-sm text-amber-900">Au moins un rendez-vous bascule au jour suivant. Choisissez une heure de départ plus tôt.</p> : null}
        {movedToPast ? <p role="status" className="mb-2 text-sm text-amber-900">Choisissez une heure de départ à venir.</p> : null}
        {lockedConflict && !busy ? <p role="status" className="mb-2 text-sm text-amber-900">Le trajet arrive après l’heure d’un rendez-vous verrouillé.</p> : null}
        {saveError ? <p role="alert" className="mb-2 text-sm font-bold text-red-700">{saveError.message}</p> : null}
        <label className="mb-2 flex min-h-11 items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={notifyClients} disabled={saving} className="h-5 w-5 shrink-0 accent-sanispa-blue"
            onChange={event => setNotifyClients(event.target.checked)} />
          Envoyer le nouveau créneau par e-mail aux clients concernés
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void saveTour()} disabled={!canSave}>{saving ? "Enregistrement…" : "Valider la tournée"}</Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={() => { setSaveError(null); onDraft(null); }}>Annuler</Button>
          {saveError?.stale ? <Button type="button" variant="secondary" onClick={() => {
            setSaveError(null);
            onDraft(null);
            reloadTour();
          }}>Recharger la tournée</Button> : null}
        </div>
        <p className="mt-1 text-sm">{incomplete && !busy ? "Renseignez l’heure de départ et les durées de trajet manquantes."
          : `${changedCount} ${changedCount === 1 ? "horaire à mettre à jour" : "horaires à mettre à jour"} dans le planning.`}</p>
      </div> : null}
    </div> : null}
  </>;
}
