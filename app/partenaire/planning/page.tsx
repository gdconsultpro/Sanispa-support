"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { PartnerScheduleGrid, PlannerTechnicianSelect } from "@/components/PartnerScheduleGrid";
import { PartnerTourMap } from "@/components/PartnerTourMap";
import { problemLabel } from "@/lib/display-labels";
import { partnerAuthError, partnerToken, redirectPartnerAccess } from "@/lib/partner-browser";
import { partnerReturnPath } from "@/lib/partner-navigation";
import {
  interventionTypes, partnerClientAddress, partnerDirections, partnerClientsPath, partnerMapPath, plannerDate, plannerDay, plannerRange, plannerTime, visitsOverlap,
  type PartnerMapPoint, type PendingPartnerDossier, type PendingPrivatePartnerVisit, type PlannerAppointment, type PlannerMapIntervention,
  type PlannerPeriod, type PlannerSlot, type PlannerTechnician, type PrivatePartnerClient,
  type PrivatePartnerStock, type PrivatePartnerVisit, type SanispaPartnerVisit, type TourBooking,
} from "@/lib/partner-planner";

const path = "/partenaire/planning";
const endpoint = "/api/partner/planning";
const PartnerPrivateMap = dynamic(() => import("@/components/PartnerPrivateMap"), {
  ssr: false,
  loading: () => <p role="status" className="p-4">Chargement de la carte…</p>,
});
const panelClass = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const inputClass = "focus-ring min-h-12 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-3 py-2 text-base";
const actionClass = "focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline";
type ClientPage = { clients: PrivatePartnerClient[]; more: boolean; technicians: PlannerTechnician[] };
type StockPage = { stock: PrivatePartnerStock[]; more: boolean };
type Agenda = {
  visits: PrivatePartnerVisit[]; sanispa: SanispaPartnerVisit[]; technicians: PlannerTechnician[];
  pendingVisits?: PendingPrivatePartnerVisit[]; pendingDossiers?: PendingPartnerDossier[];
};
type Booking = { id: string; slot: PlannerSlot };
type FormEditor = { type: "client"; id: string; client?: PrivatePartnerClient; booking?: Booking; returnToMap?: boolean }
  | { type: "visit"; id: string; client: PrivatePartnerClient; visit?: PrivatePartnerVisit | PendingPrivatePartnerVisit; slot?: PlannerSlot }
  | { type: "stock"; id: string; item?: PrivatePartnerStock };
type Editor = FormEditor | { type: "pickClient"; id: string; slot: PlannerSlot };
const periods = { day: "Jour", week: "Semaine", month: "Mois" } as const;
const stockLabels = { piece: "Pièce détachée", spa: "Spa" } as const;
class PlannerRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function plannerRequest(url: string, options: { signal?: AbortSignal; payload?: object } = {}) {
  const next = partnerReturnPath(window.location.pathname + window.location.search);
  const token = await partnerToken(next);
  if (!token || options.signal?.aborted) return null;
  const response = await fetch(url, {
    method: options.payload ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, ...(options.payload ? { "Content-Type": "application/json" } : {}) },
    body: options.payload ? JSON.stringify(options.payload) : undefined,
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(20000),
  });
  if (redirectPartnerAccess(response, next)) return null;
  const result = await response.json();
  if (!response.ok) throw new PlannerRequestError(result.error || "Votre planning est temporairement indisponible.", response.status);
  return result;
}

export default function PartnerPlanningPage() {
  const [view, setView] = useState<"agenda" | "map" | "clients" | "stock">("agenda");
  const [period, setPeriod] = useState<PlannerPeriod>("day");
  const [mapPeriod, setMapPeriod] = useState<"day" | "week">("week");
  const [day, setDay] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ClientPage | null>(null);
  const [inventory, setInventory] = useState<StockPage | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [mapped, setMapped] = useState<PrivatePartnerClient | null>(null);
  const [savedClient, setSavedClient] = useState<PrivatePartnerClient | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [gridError, setGridError] = useState("");
  const [notice, setNotice] = useState("");
  const [bookedDay, setBookedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const mapTitle = useRef<HTMLHeadingElement>(null);
  const openNewClient = useRef(false);
  const loadedAgenda = useRef("");

  const activePeriod = view === "map" ? mapPeriod : period;
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("view") === "clients") setView("clients");
    if (query.get("view") === "carte") setView("map");
    openNewClient.current = query.get("view") === "clients" && query.get("ajouter") === "1";
    setDay(plannerDate(new Date()));
  }, []);
  useEffect(() => {
    if (!day) return;
    const controller = new AbortController();
    const { from, to } = plannerRange(day, activePeriod);
    const query = view === "agenda" || view === "map" ? new URLSearchParams({
      from: from.toISOString(), to: to.toISOString(), ...(view === "map" ? { map: "1" } : {}),
    })
      : new URLSearchParams({ section: view, name: search, offset: String(offset) });
    setLoadError("");
    if (view === "clients") setPage(null);
    else if (view === "stock") setInventory(null);
    else if (loadedAgenda.current !== query.toString()) setAgenda(null);
    void plannerRequest(endpoint + "?" + query, { signal: controller.signal }).then(result => {
      if (!result || controller.signal.aborted) return;
      if (view === "clients") {
        setPage(result);
        if (openNewClient.current) {
          openNewClient.current = false;
          window.history.replaceState(null, "", partnerClientsPath);
          setEditor({ type: "client", id: crypto.randomUUID() });
        }
      }
      else if (view === "stock") setInventory(result);
      else {
        loadedAgenda.current = query.toString();
        setAgenda(result);
      }
    }).catch(error => { if (!controller.signal.aborted) setLoadError(partnerAuthError(error)); });
    return () => controller.abort();
  }, [view, day, activePeriod, search, offset, revision]);

  const mappedId = mapped?.id;
  useEffect(() => {
    if (!mappedId) return;
    mapTitle.current?.focus();
  }, [mappedId]);

  useEffect(() => {
    if (!mapped || mapped.latitude !== null || !mapped.source_diagnostic_id) return;
    const controller = new AbortController();
    setLocating(true);
    void plannerRequest(endpoint, { signal: controller.signal, payload: { action: "locateClient", id: mapped.id } })
      .then(result => {
        if (!controller.signal.aborted && result?.client?.latitude != null) setMapped(result.client);
      }).catch(() => { /* The address stays readable when geocoding is unavailable. */ })
      .finally(() => { if (!controller.signal.aborted) setLocating(false); });
    return () => { controller.abort(); setLocating(false); };
  }, [mapped]);

  function changeView(next: typeof view) {
    setMapped(null);
    setEditor(null);
    setSavedClient(null);
    setNotice("");
    setBookedDay(null);
    setSaveError("");
    setGridError("");
    setOffset(0);
    setView(next);
    window.history.replaceState(null, "", next === "clients" ? partnerClientsPath : next === "map" ? partnerMapPath : path);
  }

  async function saveFromGrid(payload: object, success: string, date?: Date) {
    if (saving) return false;
    setNotice("");
    setBookedDay(null);
    setGridError("");
    setSaving(true);
    try {
      const result = await plannerRequest(endpoint, { payload });
      if (!result) return false;
      if (date) setDay(plannerDate(date));
      setNotice(success);
      setRevision(value => value + 1);
      return true;
    } catch (error) {
      setGridError(error instanceof Error ? error.message : "La modification n’a pas pu être enregistrée.");
      if (error instanceof PlannerRequestError && error.status === 409) setRevision(value => value + 1);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveTourVisit(booking: TourBooking) {
    setSaving(true);
    try {
      const result = await plannerRequest(endpoint, { payload: { action: "bookTourVisit", ...booking } });
      if (!result) throw new Error("Reconnectez-vous pour enregistrer le rendez-vous.");
      setRevision(current => current + 1);
    } finally {
      setSaving(false);
    }
  }

  function moveFromGrid(appointment: PlannerAppointment, start: Date, technician: string | null) {
    if (!Number.isFinite(+start)) {
      setGridError("Choisissez une date et une heure valides.");
      return Promise.resolve(false);
    }
    return saveFromGrid({
      action: "moveVisit", id: appointment.id, source: appointment.source, expected_at: appointment.updated_at,
      starts_at: start.toISOString(), technician_id: technician,
    }, "Rendez-vous déplacé.", start);
  }

  function stepAgenda(direction: number) {
    const current = activePeriod;
    const anchor = plannerRange(day, current).from;
    if (current === "month") anchor.setMonth(anchor.getMonth() + direction);
    else anchor.setDate(anchor.getDate() + direction * (current === "week" ? 7 : 1));
    setMapped(null);
    setDay(plannerDate(anchor));
  }

  function edit(next: Editor) {
    setMapped(null);
    setSavedClient(null);
    setNotice("");
    setBookedDay(null);
    setSaveError("");
    setEditor(next);
  }

  function chooseBookingClient(booking: Booking, client: PrivatePartnerClient) {
    edit({ type: "visit", id: booking.id, client, slot: booking.slot });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.type === "pickClient" || saving) return;
    const values = new FormData(event.currentTarget);
    const value = (name: string) => String(values.get(name) ?? "");
    setSaveError("");
    setSaving(true);
    try {
      if (editor.type === "client") {
        const result = await plannerRequest(endpoint, {
          payload: { action: "saveClient", id: editor.id, name: value("name"), phone: value("phone"),
            email: value("email"), street: value("street"), postal_code: value("postal_code"), city: value("city"),
            intervention_type: value("intervention_type"), description: value("description") },
        });
        if (!result) return;
        if (editor.booking) {
          chooseBookingClient(editor.booking, result.client);
          return;
        }
        if (editor.client) setNotice("La fiche client a été enregistrée.");
        else setSavedClient(result.client);
        if (!editor.returnToMap) {
          setSearch("");
          setOffset(0);
          setView("clients");
        }
        setEditor(null);
        setRevision(current => current + 1);
      } else if (editor.type === "stock") {
        const result = await plannerRequest(endpoint, {
          payload: { action: "saveStock", id: editor.id, expected_at: editor.item?.updated_at ?? null,
            category: value("category"), label: value("label"), reference: value("reference"), quantity: Number(value("quantity")) },
        });
        if (!result) return;
        setEditor(null);
        setNotice("Le stock a été enregistré.");
        setRevision(current => current + 1);
      } else {
        let start: Date | null = null;
        let end: Date | null = null;
        if (value("without_date") !== "on") {
          start = new Date(value("date") + "T" + value("start"));
          end = editor.slot ? new Date(+start + Number(value("duration")) * 60000) : new Date(value("date") + "T" + value("end"));
          if (!editor.slot && end < start) end.setDate(end.getDate() + 1);
          if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start)
            throw new Error("L’heure de fin doit être après l’heure de début.");
        }
        const result = await plannerRequest(endpoint, {
          payload: { action: "saveVisit", id: editor.id, client_id: editor.client.id, title: value("intervention_type"), description: value("description"),
            starts_at: start?.toISOString() ?? null, ends_at: end?.toISOString() ?? null, technician_id: value("technician_id") || null,
            expected_at: editor.visit?.updated_at },
        });
        if (!result) return;
        if (start) {
          const date = plannerDate(start);
          setDay(date);
          setPeriod("day");
          setView("agenda");
          window.history.replaceState(null, "", path);
          setEditor(null);
          setNotice("Le rendez-vous a été enregistré.");
          setBookedDay(date);
        } else {
          changeView("map");
          setNotice("L’intervention a été ajoutée à la liste « À planifier ».");
        }
        setRevision(current => current + 1);
      }
    } catch (error) {
      setSaveError(partnerAuthError(error));
    } finally {
      setSaving(false);
    }
  }

  const entries = agenda ? [
    ...agenda.visits.map(visit => ({ ...visit, source: "private" as const })),
    ...agenda.sanispa.map(visit => ({ ...visit, source: "sanispa" as const })),
  ].sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at)) : null;
  const team = (view === "clients" ? page?.technicians : agenda?.technicians) ?? [];
  const currentBooking = editor?.type === "client" ? editor.booking : editor?.type === "visit" && editor.slot
    ? { id: editor.id, slot: editor.slot } : undefined;
  const appointments: PlannerAppointment[] = (entries ?? []).map(entry => entry.source === "private" ? {
    ...entry, title: entry.title + " · " + entry.client.name, movable: true,
  } : {
    ...entry, id: entry.diagnostic_id,
    title: problemLabel(entry.diagnostic.problem_type) + " · " + (entry.diagnostic.customer?.name || "Client"),
    movable: entry.diagnostic.status !== "CLOSED" && entry.diagnostic.status !== "terminé",
  });
  const month = day && view === "agenda" && period === "month" ? plannerRange(day, "month") : null;
  const mapWeek = day && view === "map" && mapPeriod === "week" ? plannerRange(day, "week").from : null;
  const monthDays = month ? new Date(month.to.getFullYear(), month.to.getMonth(), 0).getDate() : 0;
  const monthIndent = month ? (month.from.getDay() + 6) % 7 : 0;
  const mapItems = useMemo<PlannerMapIntervention[] | null>(() => {
    if (!agenda || view !== "map") return null;
    const own = [...agenda.visits, ...(agenda.pendingVisits ?? [])].map(visit => ({
      id: "private:" + visit.id, title: `${visit.title} · ${visit.client.name}`, startsAt: visit.starts_at, technicianId: visit.technician_id,
      endsAt: visit.ends_at ?? undefined, address: partnerClientAddress(visit.client),
      latitude: visit.latitude ?? visit.client.latitude, longitude: visit.longitude ?? visit.client.longitude,
      approximateLocation: visit.approximateLocation, client: visit.client, visit,
    }));
    const scheduled = agenda.sanispa.map(visit => ({
      id: "sanispa:" + visit.diagnostic_id, dossierId: visit.diagnostic_id, startsAt: visit.starts_at, endsAt: visit.ends_at, technicianId: visit.technician_id,
      title: `${problemLabel(visit.diagnostic.problem_type)} · ${visit.diagnostic.customer?.name || "Client"}`,
      address: visit.diagnostic.customer?.address ?? "", latitude: visit.latitude ?? null, longitude: visit.longitude ?? null,
    }));
    const pending = (agenda.pendingDossiers ?? []).map(dossier => ({
      id: "sanispa:" + dossier.id, dossierId: dossier.id, startsAt: null, technicianId: null,
      title: `${problemLabel(dossier.problem_type)} · ${dossier.customer?.name || "Client"}`,
      address: dossier.customer?.address ?? "", latitude: dossier.latitude ?? null, longitude: dossier.longitude ?? null,
      approximateLocation: dossier.approximateLocation,
    }));
    return [...own, ...scheduled, ...pending].sort((left, right) =>
      (left.startsAt ? Date.parse(left.startsAt) : Infinity) - (right.startsAt ? Date.parse(right.startsAt) : Infinity));
  }, [agenda, view]);
  const selectedPoint = useMemo<PartnerMapPoint[]>(() => mapped && mapped.latitude !== null && mapped.longitude !== null ? [{
    id: mapped.id, latitude: mapped.latitude, longitude: mapped.longitude, title: mapped.name, address: partnerClientAddress(mapped),
  }] : [], [mapped]);

  return <AppShell compact>
    <PartnerNavigation current="Planning" />
    <h1 className="text-3xl font-bold">Mon planning</h1>
    <div className="mb-4 mt-4 flex flex-wrap gap-2" aria-label="Rubriques du planning">
      <Button type="button" variant={view === "agenda" ? "primary" : "secondary"} aria-pressed={view === "agenda"} disabled={saving} onClick={() => changeView("agenda")}>Agenda</Button>
      <Button type="button" variant={view === "map" ? "primary" : "secondary"} aria-pressed={view === "map"} disabled={saving} onClick={() => changeView("map")}>Carte</Button>
      <Button type="button" variant={view === "clients" ? "primary" : "secondary"} aria-pressed={view === "clients"} disabled={saving} onClick={() => changeView("clients")}>Mes clients</Button>
      <Button type="button" variant={view === "stock" ? "primary" : "secondary"} aria-pressed={view === "stock"} disabled={saving} onClick={() => changeView("stock")}>Mon stock</Button>
    </div>

    {notice ? <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
      <p role="status">{notice}</p>
      {bookedDay ? <button type="button" className={actionClass} onClick={() => {
        setDay(bookedDay);
        setMapPeriod("day");
        changeView("map");
      }}>Voir le rendez-vous sur la carte</button> : null}
    </div> : null}
    {gridError ? <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{gridError}</p> : null}
    {savedClient && view === "clients" ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p role="status" className="break-words font-bold text-emerald-900">Fiche créée pour {savedClient.name}.</p>
      <button type="button" className={actionClass} onClick={() => edit({ type: "visit", id: crypto.randomUUID(), client: savedClient })}>Planifier une première visite</button>
    </div> : null}
    {loadError ? <div className={panelClass}>
      <p role="alert" className="text-red-700">{loadError}</p>
      <button type="button" className={actionClass} onClick={() => setRevision(value => value + 1)}>Réessayer</button>
    </div> : null}
    {!loadError && (view === "clients" ? !page : view === "stock" ? !inventory : !agenda) ? <p role="status">Chargement…</p> : null}

    {editor?.type === "pickClient" ? <SlotClientPicker key={editor.id} slot={editor.slot} team={team}
      choose={client => chooseBookingClient(editor, client)}
      add={() => edit({ type: "client", id: crypto.randomUUID(), booking: editor })}
      close={() => setEditor(null)} />
      : editor ? <PlannerEditor key={editor.type + editor.id} editor={editor} day={day} team={team}
        save={save} error={saveError} saving={saving} close={() => setEditor(null)}
        back={currentBooking ? () => edit({ type: "pickClient", ...currentBooking }) : undefined} /> : null}

    {mapped ? <section className={panelClass + " mb-4"} aria-labelledby="map-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="map-title" ref={mapTitle} tabIndex={-1} className="break-words text-xl font-bold">Adresse de {mapped.name}</h2>
        <button type="button" className={actionClass} onClick={() => setMapped(null)}>Fermer la carte</button>
      </div>
      {selectedPoint.length
        ? <PartnerPrivateMap key={mapped.id} points={selectedPoint} />
        : <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">{locating ? "Recherche de l’adresse…" : "L’adresse n’a pas été localisée avec assez de précision. Vérifiez le numéro, la rue et le code postal dans la fiche client."}</p>}
      <p className="mt-3 break-words">{partnerClientAddress(mapped) || "Adresse à compléter dans la fiche client."}</p>
      {partnerClientAddress(mapped) ? <a href={partnerDirections(partnerClientAddress(mapped))} target="_blank" rel="noreferrer" className={actionClass}>Ouvrir l’itinéraire</a> : null}
    </section> : null}

    {view === "clients" && page ? <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Mon carnet clients</h2>
        <Button type="button" disabled={saving} onClick={() => edit({ type: "client", id: crypto.randomUUID() })}>Ajouter un client</Button>
      </div>
      <form className="my-4 flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        setOffset(0);
        setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
      }}>
        <label className="min-w-0 flex-1 text-sm font-bold">
          Rechercher par nom
          <input key={search} name="search" type="search" defaultValue={search} maxLength={140} className={inputClass + " mt-1"} />
        </label>
        <Button type="submit" variant="secondary">Rechercher</Button>
      </form>
      {page.clients.length ? <ul className="divide-y divide-sanispa-line">
        {page.clients.map(client => <li key={client.id} className="py-3">
          <h3 className="break-words font-bold">{client.name}</h3>
          <p className="break-words text-sm">{partnerClientAddress(client) || "Adresse à compléter"}</p>
          {client.phone || client.email ? <p className="break-words text-sm text-sanispa-steel">{[client.phone, client.email].filter(Boolean).join(" · ")}</p> : null}
          {client.intervention_type !== interventionTypes[0] || client.description ? <p className="break-words text-sm font-bold">{client.intervention_type}</p> : null}
          {client.description ? <p className="whitespace-pre-wrap break-words text-sm">{client.description}</p> : null}
          <div className="flex flex-wrap gap-x-4">
            <button type="button" className={actionClass} disabled={saving} onClick={() => edit({ type: "visit", id: crypto.randomUUID(), client })}>Planifier une intervention</button>
            <button type="button" className={actionClass} disabled={saving} onClick={() => edit({ type: "client", id: client.id, client })}>Modifier la fiche</button>
            {partnerClientAddress(client) ? <button type="button" className={actionClass} disabled={saving} onClick={() => { setEditor(null); setMapped(client); }}>Voir sur la carte</button> : null}
            {client.source_diagnostic_id ? <Link className={actionClass} href={"/partenaire/interventions/" + client.source_diagnostic_id}>Ouvrir le dossier SANISPA</Link> : null}
          </div>
        </li>)}
      </ul> : <p>{search ? "Aucun client trouvé." : "Ajoutez votre premier client pour planifier une intervention."}</p>}
      {offset || page.more ? <div className="mt-3 flex gap-3">
        <Button type="button" variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 30))}>Précédent</Button>
        <Button type="button" variant="secondary" disabled={!page.more} onClick={() => setOffset(value => value + 30)}>Suivant</Button>
      </div> : null}
    </section> : null}

    {view === "stock" && inventory ? <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Pièces détachées et spas</h2>
        <Button type="button" disabled={saving} onClick={() => edit({ type: "stock", id: crypto.randomUUID() })}>Ajouter un article</Button>
      </div>
      {inventory.stock.length ? <ul className="mt-3 divide-y divide-sanispa-line">
        {inventory.stock.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 py-3">
          <div className="min-w-0">
            <h3 className="break-words font-bold">{item.label}</h3>
            <p className="break-words text-sm">{stockLabels[item.category]}{item.reference ? " · " + item.reference : ""}</p>
            <p className="text-sm font-bold">{item.quantity} en stock</p>
          </div>
          <button type="button" className={actionClass} disabled={saving} onClick={() => edit({ type: "stock", id: item.id, item })}>Modifier l’article</button>
        </li>)}
      </ul> : <p className="mt-3">Aucun article en stock pour le moment.</p>}
      {offset || inventory.more ? <div className="mt-3 flex gap-3">
        <Button type="button" variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 30))}>Précédent</Button>
        <Button type="button" variant="secondary" disabled={!inventory.more} onClick={() => setOffset(value => value + 30)}>Suivant</Button>
      </div> : null}
    </section> : null}

    {(view === "agenda" || view === "map") && day && !loadError ? <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{view === "map" ? "Carte des interventions" : period === "day" ? "Interventions du jour" : period === "week" ? "Interventions de la semaine" : "Calendrier du mois"}</h2>
        <button type="button" disabled={saving} className={actionClass} onClick={() => changeView("clients")}>Planifier une intervention</button>
      </div>
      {view === "agenda" ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Période du planning">
        {(Object.keys(periods) as PlannerPeriod[]).map(option => <Button type="button" key={option}
          aria-pressed={period === option} variant={period === option ? "primary" : "secondary"} disabled={saving}
          onClick={() => { setMapped(null); setPeriod(option); }}>{periods[option]}</Button>)}
      </div> : <div className="mt-3 flex flex-wrap gap-2" aria-label="Période de la carte">
        {(["day", "week"] as const).map(option => <Button type="button" key={option}
          aria-pressed={mapPeriod === option} variant={mapPeriod === option ? "primary" : "secondary"}
          onClick={() => setMapPeriod(option)}>{periods[option]}</Button>)}
      </div>}
      <div className="mb-3 mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 sm:max-w-md">
        <Button type="button" variant="secondary" aria-label="Période précédente" onClick={() => stepAgenda(-1)}>‹</Button>
        <label className="min-w-0 text-sm font-bold">Date du planning
          <input type="date" min="1900-01-01" max="2099-12-31" value={day} className={inputClass + " mt-1"} onChange={event => {
            if (event.target.value) { setMapped(null); setDay(event.target.value); }
          }} />
        </label>
        <Button type="button" variant="secondary" aria-label="Période suivante" onClick={() => stepAgenda(1)}>›</Button>
      </div>
      {day !== plannerDate(new Date()) ? <button type="button" className={actionClass + " mb-2"} onClick={() => {
        setMapped(null);
        setDay(plannerDate(new Date()));
      }}>Aujourd’hui</button> : null}
      {view === "agenda" && period === "day" && entries ? <PartnerScheduleGrid key={day} day={day} appointments={appointments}
        team={team} busy={saving} onMove={moveFromGrid}
        onCreate={slot => edit({ type: "pickClient", id: crypto.randomUUID(), slot })}
        onAdd={(id, name) => saveFromGrid({ action: "addTechnician", id, name }, "Technicien ajouté au planning.")} /> : null}
      {view === "map" ? <>
        {mapWeek ? <p className="mb-3 font-bold">Semaine du {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })
          .formatRange(mapWeek, plannerDay(plannerDate(mapWeek), 6))}</p> : null}
        <PartnerTourMap items={mapItems} team={team} period={mapPeriod} scope={day} busy={saving} onBook={saveTourVisit}
          onVisit={visit => edit({ type: "visit", id: visit.id, client: visit.client, visit })}
          onAddress={client => edit({ type: "client", id: client.id, client, returnToMap: true })} />
      </> : null}
      {month && entries ? <>
        <p className="mb-2 font-bold capitalize">{month.from.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
        <div className="grid grid-cols-7 gap-1" aria-label="Jours du mois">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(label => <span className="py-1 text-center text-xs font-bold" key={label}>{label}</span>)}
          {Array.from({ length: monthIndent }, (_, index) => <span key={"empty-" + index} aria-hidden="true" />)}
          {Array.from({ length: monthDays }, (_, index) => {
            const date = plannerDay(plannerDate(month.from), index);
            const localDate = plannerDate(date);
            const window = { starts_at: date.toISOString(), ends_at: plannerDay(localDate, 1).toISOString() };
            const count = entries.filter(entry => visitsOverlap(entry, window)).length;
            return <button type="button" key={localDate} aria-label={`${date.toLocaleDateString("fr-FR", { dateStyle: "long" })}, ${count} rendez-vous`}
              className={`focus-ring min-h-11 min-w-0 rounded-lg border px-0.5 py-1 text-xs sm:text-sm ${count ? "border-sanispa-blue bg-sanispa-ice font-bold" : "border-sanispa-line bg-white"}`}
              onClick={() => { setMapped(null); setDay(localDate); setPeriod("day"); }}>
              <span className="block">{index + 1}</span>
              {count ? <span className="block text-sanispa-blue">{count} RDV</span> : null}
            </button>;
          })}
        </div>
      </> : null}
      {view === "agenda" && !month && entries?.length ? <ul className="divide-y divide-sanispa-line">
        {entries.map((entry, index) => <li className="py-3" key={entry.source + (entry.source === "private" ? entry.id : entry.diagnostic_id)}>
          {view === "agenda" && period === "week" ? <p className="mb-1 text-sm font-bold capitalize">{new Date(entry.starts_at).toLocaleDateString("fr-FR", { dateStyle: "full" })}</p> : null}
          <p className="text-sm font-bold">{plannerTime(entry.starts_at)} – {plannerTime(entry.ends_at)}</p>
          {team.find(technician => technician.id === entry.technician_id) ? <p className="text-sm">{team.find(technician => technician.id === entry.technician_id)?.name}</p> : null}
          {entries.some((other, i) => index !== i && other.technician_id === entry.technician_id && visitsOverlap(entry, other)) ? <p className="text-sm font-bold text-amber-800">Chevauchement avec un autre rendez-vous</p> : null}
          {entry.source === "private" ? <>
            <h3 className="break-words text-lg font-bold">{entry.title} · {entry.client.name}</h3>
            <p className="break-words text-sm">{partnerClientAddress(entry.client) || "Adresse à compléter dans la fiche client"}</p>
            {entry.description ? <p className="whitespace-pre-wrap break-words text-sm">{entry.description}</p> : null}
            <div className="flex flex-wrap gap-x-4">
              {partnerClientAddress(entry.client) ? <button type="button" disabled={saving} className={actionClass} onClick={() => { setEditor(null); setMapped(entry.client); }}>Voir sur la carte</button> : null}
              <button type="button" disabled={saving} className={actionClass} onClick={() => edit({ type: "visit", id: entry.id, client: entry.client, visit: entry })}>Modifier le rendez-vous</button>
            </div>
          </> : <>
            <h3 className="break-words text-lg font-bold">{problemLabel(entry.diagnostic.problem_type)} · {entry.diagnostic.customer?.name || "Client"}</h3>
            {entry.diagnostic.customer?.address ? <p className="break-words text-sm">{entry.diagnostic.customer.address}</p> : null}
            <Link className={actionClass} href={"/partenaire/interventions/" + entry.diagnostic_id}>Ouvrir le dossier SANISPA</Link>
          </>}
        </li>)}
      </ul> : view === "agenda" && !month && entries ? <p>Aucune intervention prévue sur cette période.</p> : null}
    </section> : null}
  </AppShell>;
}

function slotSummary(slot: PlannerSlot, team: PlannerTechnician[]) {
  const date = new Date(slot.startsAt).toLocaleDateString("fr-FR", { dateStyle: "long" });
  const technician = team.find(member => member.id === slot.technicianId)?.name ?? "À affecter";
  return `${date} à ${plannerTime(slot.startsAt)} · ${technician}`;
}

function SlotClientPicker({ slot, team, choose, add, close }: {
  slot: PlannerSlot; team: PlannerTechnician[]; choose: (client: PrivatePartnerClient) => void; add: () => void; close: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ClientPage | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ section: "clients", name: search, offset: String(offset) });
    setPage(null);
    setError("");
    void plannerRequest(endpoint + "?" + params, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted && result) setPage(result); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Impossible de charger les clients."); });
    return () => controller.abort();
  }, [search, offset, attempt]);

  return <section className={panelClass + " mb-4"} aria-labelledby="booking-title">
    <h2 id="booking-title" ref={heading} tabIndex={-1} className="text-xl font-bold">Nouveau rendez-vous</h2>
    <p className="mt-1 text-sm">{slotSummary(slot, team)}</p>
    <div className="my-3 flex flex-wrap gap-2">
      <Button type="button" onClick={add}>Ajouter un client</Button>
      <Button type="button" variant="secondary" onClick={close}>Annuler</Button>
    </div>
    <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      setOffset(0);
      setSearch(String(new FormData(event.currentTarget).get("name") ?? "").trim());
    }}>
      <label className="min-w-0 flex-1 text-sm font-bold">
        Rechercher un client
        <input name="name" type="search" maxLength={140} className={inputClass + " mt-1"} />
      </label>
      <Button type="submit" variant="secondary">Rechercher</Button>
    </form>
    {error ? <div role="alert" className="text-sm text-red-700">{error} <button type="button" className={actionClass} onClick={() => setAttempt(value => value + 1)}>Réessayer</button></div>
      : !page ? <p role="status" className="text-sm">Chargement des clients…</p>
      : !page.clients.length ? <p className="text-sm">{search ? "Aucun client ne correspond à cette recherche." : "Le carnet est vide."}</p>
      : <ul className="max-h-80 divide-y divide-sanispa-line overflow-y-auto">
        {page.clients.map(client => <li key={client.id}>
          <button type="button" className="focus-ring block min-h-12 w-full rounded-md px-2 py-2 text-left hover:bg-sanispa-ice" onClick={() => choose(client)}>
            <span className="block break-words font-bold">{client.name}</span>
            <span className="block break-words text-sm text-sanispa-steel">{partnerClientAddress(client) || "Adresse à compléter"}</span>
          </button>
        </li>)}
      </ul>}
    {page && (offset > 0 || page.more) ? <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 30))}>Précédent</Button>
      <Button type="button" variant="secondary" disabled={!page.more} onClick={() => setOffset(value => value + 30)}>Suivant</Button>
    </div> : null}
  </section>;
}

function PlannerEditor({ editor, day, team, save, saving, error, close, back }: {
  editor: FormEditor; day: string; team: PlannerTechnician[]; save: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean; error: string; close: () => void; back?: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const [withoutDate, setWithoutDate] = useState(false);
  useEffect(() => { title.current?.focus(); }, []);
  const visit = editor.type === "visit" ? editor.visit : undefined;
  const slot = editor.type === "visit" ? editor.slot : editor.type === "client" ? editor.booking?.slot : undefined;
  const startsAt = visit?.starts_at ?? slot?.startsAt;
  const startingDay = startsAt ? plannerDate(new Date(startsAt)) : day;
  return <section className={panelClass + " mb-4"}>
    <h2 ref={title} tabIndex={-1} className="break-words text-xl font-bold">
      {editor.type === "client" ? editor.client ? "Modifier la fiche client" : "Ajouter un client"
        : editor.type === "stock" ? editor.item ? "Modifier l’article" : "Ajouter un article"
        : `Intervention chez ${editor.client.name}`}
    </h2>
    {editor.type === "client" && slot ? <p className="mt-2 text-sm">{slotSummary(slot, team)}</p> : null}
    {editor.type === "visit" ? <p className="mt-2 break-words text-sm">{partnerClientAddress(editor.client)}</p> : null}
    <form onSubmit={save}>
      <fieldset disabled={saving} className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {editor.type === "client" ? <>
          <PlannerField label="Nom du client" name="name" maxLength={140} defaultValue={editor.client?.name} required />
          <PlannerField label="Téléphone (facultatif)" name="phone" type="tel" maxLength={35} defaultValue={editor.client?.phone} />
          <details open={editor.client || editor.booking ? true : undefined} className="min-w-0 rounded-xl border border-sanispa-line p-3 sm:col-span-2">
            <summary className="focus-ring cursor-pointer text-sm font-bold">Ajouter l’adresse et les détails (facultatif)</summary>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <PlannerField label="E-mail" name="email" type="email" maxLength={254} defaultValue={editor.client?.email} />
              <PlannerField label="Numéro et nom de rue" name="street" maxLength={160} defaultValue={editor.client?.street} />
              <PlannerField label="Code postal" name="postal_code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue={editor.client?.postal_code} />
              <PlannerField label="Ville" name="city" maxLength={100} defaultValue={editor.client?.city} />
              <InterventionFields type={editor.client?.intervention_type} description={editor.client?.description} />
            </div>
          </details>
        </> : editor.type === "stock" ? <>
          <PlannerField label="Nom de l’article" name="label" maxLength={140} defaultValue={editor.item?.label} required />
          <label className="min-w-0 text-sm font-bold">Catégorie
            <select name="category" defaultValue={editor.item?.category ?? "piece"} className={inputClass + " mt-1"}>
              <option value="piece">Pièce détachée</option>
              <option value="spa">Spa</option>
            </select>
          </label>
          <PlannerField label="Référence ou modèle (facultatif)" name="reference" maxLength={100} defaultValue={editor.item?.reference} />
          <PlannerField label="Quantité en stock" name="quantity" type="number" inputMode="numeric" min={0} max={1000000} step={1} defaultValue={editor.item?.quantity ?? 0} required />
        </> : <>
          <InterventionFields type={visit?.title ?? editor.client.intervention_type} description={visit?.description ?? editor.client.description} />
          {!slot && !visit ? <label className="flex min-h-11 items-center gap-2 text-sm font-bold sm:col-span-2">
            <input type="checkbox" name="without_date" checked={withoutDate} onChange={event => setWithoutDate(event.target.checked)} />
            Ajouter à « À planifier » sans fixer de date
          </label> : null}
          <PlannerField label="Jour de l’intervention" name="date" type="date" min="1900-01-01" max="2099-12-31" defaultValue={startingDay} required disabled={withoutDate} hidden={withoutDate} />
          <PlannerField label="Heure de début" name="start" type="time" defaultValue={startsAt ? plannerTime(startsAt) : "09:00"} required disabled={withoutDate} hidden={withoutDate} />
          {slot ? <PlannerField label="Durée (en minutes)" name="duration" type="number" min={1} max={720} defaultValue={60} required />
            : <PlannerField label="Heure de fin" name="end" type="time" defaultValue={visit?.ends_at ? plannerTime(visit.ends_at) : "10:00"} required disabled={withoutDate} hidden={withoutDate} />}
          <PlannerTechnicianSelect team={team} selected={visit?.technician_id ?? slot?.technicianId} />
        </>}
        {error ? <p role="alert" className="text-sm font-bold text-red-700 sm:col-span-2">{error}</p> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit">{saving ? "Enregistrement…" : editor.type === "client" ? editor.booking ? "Enregistrer le client et continuer" : "Enregistrer le client"
            : editor.type === "stock" ? "Enregistrer l’article" : withoutDate ? "Ajouter à planifier" : "Enregistrer le rendez-vous"}</Button>
          {back ? <Button type="button" variant="secondary" onClick={back}>Changer de client</Button> : null}
          <Button type="button" variant="secondary" onClick={close}>Annuler</Button>
        </div>
      </fieldset>
    </form>
  </section>;
}

function InterventionFields({ type = interventionTypes[0], description }: { type?: string; description?: string }) {
  const [selection, setSelection] = useState(interventionTypes.includes(type) ? type : "other");
  return <>
    <label className="min-w-0 text-sm font-bold">Type d’intervention
      <select name={selection === "other" ? undefined : "intervention_type"} value={selection}
        className={inputClass + " mt-1"} onChange={event => setSelection(event.target.value)}>
        {interventionTypes.map(option => <option key={option} value={option}>{option}</option>)}
        <option value="other">Type personnalisé</option>
      </select>
    </label>
    {selection === "other" ? <PlannerField label="Nom du type personnalisé" name="intervention_type" maxLength={140}
      defaultValue={interventionTypes.includes(type) ? "" : type} required /> : null}
    <label className="min-w-0 text-sm font-bold sm:col-span-2">Descriptif de la panne ou de l’intervention (facultatif)
      <textarea name="description" rows={3} maxLength={2500} defaultValue={description} className={inputClass + " mt-1"} />
    </label>
  </>;
}

function PlannerField({ label, hidden, ...input }: React.ComponentProps<"input"> & { label: string }) {
  return <label hidden={hidden} className="min-w-0 text-sm font-bold">{label}<input {...input} className={inputClass + " mt-1"} /></label>;
}
