"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { plannerDay, plannerTime, type MapCoordinate, type PartnerMapPoint, type PlannerMapIntervention, type PlannerTechnician } from "@/lib/partner-planner";
import { maximumTourRouteStops, minutesMissingBetweenStops, orderTourStops, scheduledTechnicianDays, tourCoordinate, tourDuration,
  type TourDrivingRoute, type TourOrder, type TourStop } from "@/lib/partner-tour-routing";

const PrivateMap = dynamic(() => import("@/components/PartnerPrivateMap"), {
  ssr: false,
  loading: () => <p role="status">Chargement de la carte…</p>,
});
const dayFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" });
const emptyStops: TourStop[] = [];
const filterClass = "focus-ring mt-1 min-h-12 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-3 text-base";

export type LoadDrivingTour = (stops: (MapCoordinate | null)[], signal: AbortSignal) => Promise<TourDrivingRoute>;

export function PartnerDrivingTour({ items, technician, scope, loadRoute }: {
  items: PlannerMapIntervention[] | null;
  technician: PlannerTechnician | undefined;
  scope: string;
  loadRoute: LoadDrivingTour;
}) {
  const [chosenDay, setChosenDay] = useState("");
  const [order, setOrder] = useState<TourOrder>("schedule");
  const id = useId();
  const days = useMemo(() => items && technician ? scheduledTechnicianDays(items, technician.id) : new Map<string, TourStop[]>(), [items, technician]);
  const dates = [...days.keys()].sort();
  const day = days.has(chosenDay) ? chosenDay : days.has(scope) ? scope : dates[0];
  const scheduled = days.get(day) ?? emptyStops;
  const stops = useMemo(() => orderTourStops(scheduled, order), [scheduled, order]);

  return <section aria-label="Tournée du technicien">
    {!items ? <p role="status">Chargement du planning…</p>
      : !technician ? <p>Choisissez un technicien pour afficher sa tournée.</p>
      : !day ? <p>Aucun rendez-vous planifié pour {technician.name} sur cette période.</p> : <>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={id + "-day"} className="text-sm font-bold">Jour de tournée</label>
            <select id={id + "-day"} value={day} onChange={event => setChosenDay(event.target.value)} className={filterClass}>
              {dates.map(date => <option key={date} value={date}>{dayFormat.format(plannerDay(date))}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={id + "-order"} className="text-sm font-bold">Ordre de passage</label>
            <select id={id + "-order"} value={order} onChange={event => setOrder(event.target.value as TourOrder)} className={filterClass}>
              <option value="schedule">Selon les horaires prévus</option>
              <option value="proximity">Par proximité</option>
            </select>
          </div>
        </div>
        {order === "proximity" ? <p className="mb-3 text-sm">La première étape reste fixe. Chaque étape suivante est choisie par proximité géographique. Vérifiez sa compatibilité avec les horaires prévus.</p> : null}
      </>}
    <DrivingTourMap stops={stops} loadRoute={loadRoute} label={technician ? "Carte de la tournée de " + technician.name : "Carte de la tournée"} />
  </section>;
}

function DrivingTourMap({ stops, loadRoute, label }: { stops: TourStop[]; loadRoute: LoadDrivingTour; label: string }) {
  const [result, setResult] = useState<{ key: string; route?: TourDrivingRoute; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, TourDrivingRoute>());
  const coordinates = stops.map(tourCoordinate);
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
    void loadRoute(points, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      if (response.legs.every((leg, index) => leg || !points[index] || !points[index + 1])) {
        if (cache.current.size >= 12) cache.current.clear();
        cache.current.set(requestKey, response);
      }
      setResult({ key: activeKey, route: response });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key: activeKey, error: error instanceof Error ? error.message : "Calcul du trajet indisponible." });
    });
    return () => controller.abort();
  }, [activeKey, requestKey, loadRoute]);

  const points = useMemo<PartnerMapPoint[]>(() => stops.flatMap((stop, index) => {
    const coordinate = tourCoordinate(stop);
    return coordinate ? [{ ...coordinate, id: stop.id, title: stop.title, address: stop.address, step: index + 1,
      detail: plannerTime(stop.startsAt) + (stop.approximateLocation ? " · Position approximative (commune)" : "") }] : [];
  }), [stops]);
  const busy = Boolean(requestKey && !visible);
  const hasFailedLegs = route?.legs.some((leg, index) => !leg && coordinates[index] && coordinates[index + 1]);
  const calculated = route?.legs.flatMap(leg => leg ?? []) ?? [];

  return <>
    <PrivateMap points={points} routeLines={route?.lines} label={label} />
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
          return <li key={stop.id} className="py-3">
            {previous ? <div className="mb-2 text-sm font-semibold">
              {leg ? <>Trajet depuis l’étape {index} · {tourDuration(leg.seconds)}{approximate ? " · Position approximative" : ""}</>
                : !busy ? <>Trajet depuis l’étape {index} · {!coordinates[index - 1] || !coordinates[index] ? "adresse à localiser" : "durée indisponible"}</> : null}
              {outOfOrder ? <p className="text-amber-900">Cet ordre inverse deux rendez-vous. Horaires à revoir.</p>
                : missingMinutes > 0 ? <p className="text-amber-900">{leg ? `Prévoyez ${missingMinutes} min de plus entre ces rendez-vous.` : "Les horaires de ces rendez-vous se chevauchent."}</p> : null}
            </div> : null}
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-sanispa-blue px-1 text-sm font-bold text-white">{index + 1}</span>
              <div className="min-w-0">
                <h4 className="break-words font-bold">{stop.title}</h4>
                <p className="text-sm font-bold">{plannerTime(stop.startsAt)} – {plannerTime(stop.endsAt)}</p>
                <p className="break-words text-sm">{stop.address || "Adresse à compléter"}</p>
                {stop.approximateLocation ? <p className="text-sm text-sanispa-steel">Position approximative (commune)</p> : null}
              </div>
            </div>
          </li>;
        })}
      </ol>
    </div> : null}
  </>;
}
