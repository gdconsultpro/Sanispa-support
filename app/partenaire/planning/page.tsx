"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { PartnerClientFile } from "@/components/PartnerClientFile";
import { PartnerSpaOptions } from "@/components/PartnerClientSpas";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { PartnerPlanningResources } from "@/components/PartnerPlanningResources";
import { PartnerScheduleGrid, PlannerTechnicianSelect } from "@/components/PartnerScheduleGrid";
import { fillPlannerSlot, PartnerSlotSuggestions } from "@/components/PartnerSlotSuggestions";
import { PartnerStockImport } from "@/components/PartnerStockImport";
import { PartnerStockHistory } from "@/components/PartnerStockHistory";
import { PartnerTeamAssignment } from "@/components/PartnerTeamAssignment";
import { PartnerTourMap } from "@/components/PartnerTourMap";
import { PartnerVisitDelete } from "@/components/PartnerVisitDelete";
import { PartnerVisitUnplan } from "@/components/PartnerVisitUnplan";
import { PartnerWorkspaceFilters } from "@/components/PartnerWorkspaceFilters";
import { problemLabel } from "@/lib/display-labels";
import { partnerAuthError } from "@/lib/partner-browser";
import { defaultInterventionDurations, planningResourcesPath, sanispaSchedulingType, schedulingDuration,
  type InterventionDuration, type PlanningResources } from "@/lib/partner-availability";
import { plannerRequest, PlannerRequestError } from "@/lib/partner-planner-browser";
import {
  hasCompletePartnerAddress, partnerClientAddress, partnerClientIdPattern, partnerClientPath, partnerClientVisitTiming, partnerDirections,
  partnerClientsPath, partnerPrivateVisitPath, partnerStockPath, plannerDate, plannerDay, plannerRange, plannerTime, visitsOverlap,
  type MapCoordinate, type PartnerMapPoint, type PendingPrivatePartnerVisit, type PlannerAppointment,
  type PartnerClientHistory, type PartnerClientSpa, type PartnerPrivateVisitFile, type PlannerPeriod, type PlannerQueueEntry, type PlannerSlot, type PlannerTechnician, type PrivatePartnerClient,
  type PrivatePartnerStock, type PrivatePartnerVisit, type TourBooking,
} from "@/lib/partner-planner";
import { matchesWorkFilters, readWorkspaceSelection, workItemPath, workStatusLabels, workspacePath, workspaceWorkItems,
  type PartnerWorkspaceData, type WorkFilterStatus, type WorkspaceSelection } from "@/lib/partner-workspace";
import type { TourApplyResult, TourDrivingRoute, TourReschedule } from "@/lib/partner-tour-routing";

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
type Booking = { id: string; slot?: PlannerSlot };
type VisitLocation = { id: string; startsAt: string | null };
type FormEditor = { type: "client"; id: string; client?: PrivatePartnerClient; booking?: Booking; returnToMap?: boolean }
  | { type: "visit"; id: string; client: PrivatePartnerClient; visit?: PrivatePartnerVisit | PendingPrivatePartnerVisit; booking?: Booking; withoutDate?: boolean; spaId?: string }
  | { type: "stock"; id: string; item?: PrivatePartnerStock };
type Editor = FormEditor | ({ type: "pickClient" } & Booking);
const stockLabels = { piece: "Pièce détachée", spa: "Spa" } as const;
const workspaceLabels = { agenda: "Planning", map: "Carte", clients: "Clients", stock: "Stock" } as const;

export default function PartnerPlanningPage() {
  const router = useRouter();
  const [view, setView] = useState<"agenda" | "map" | "clients" | "stock">("agenda");
  const [period, setPeriod] = useState<PlannerPeriod>("day");
  const [workStatus, setWorkStatus] = useState<WorkFilterStatus>("all");
  const [technician, setTechnician] = useState("all");
  const [appointmentToOpen, setAppointmentToOpen] = useState<PlannerAppointment | null>(null);
  const [mapVisitId, setMapVisitId] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ClientPage | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [file, setFile] = useState<PartnerClientHistory | null>(null);
  const [directVisitId, setDirectVisitId] = useState<string | null>(null);
  const [directVisit, setDirectVisit] = useState<PartnerPrivateVisitFile | null>(null);
  const [directError, setDirectError] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [inventory, setInventory] = useState<StockPage | null>(null);
  const [stockHistoryArticle, setStockHistoryArticle] = useState<Pick<PrivatePartnerStock, "id" | "label"> | null>(null);
  const [agenda, setAgenda] = useState<PartnerWorkspaceData | null>(null);
  const [resources, setResources] = useState<PlanningResources | null>(null);
  const [resourceError, setResourceError] = useState("");
  const [resourceRevision, setResourceRevision] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [mapped, setMapped] = useState<(PrivatePartnerClient & { approximateLocation?: boolean }) | null>(null);
  const [savedClient, setSavedClient] = useState<PrivatePartnerClient | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [gridError, setGridError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedVisit, setSavedVisit] = useState<VisitLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const mapTitle = useRef<HTMLHeadingElement>(null);
  const mapDateVersion = useRef(0);
  const openNewClient = useRef(false);
  const loadedAgenda = useRef("");

  const selection = { day, period, status: workStatus, technician };
  useEffect(() => {
    const controller = new AbortController();
    void plannerRequest(planningResourcesPath, { signal: controller.signal }).then(result => {
      if (result && !controller.signal.aborted) {
        setResources(result);
        setResourceError("");
      }
    }).catch(cause => {
      if (!controller.signal.aborted) setResourceError(partnerAuthError(cause));
    });
    return () => controller.abort();
  }, [resourceRevision]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const initial = readWorkspaceSelection(window.location.search);
    const onMap = query.get("view") === "carte";
    setPeriod(initial.period ?? (onMap && !initial.day ? "week" : "day"));
    setWorkStatus(initial.status ?? (onMap ? initial.day ? "scheduled" : "pending" : "all"));
    setTechnician(initial.technician ?? "all");
    const modify = query.get("modifier");
    if (modify && partnerClientIdPattern.test(modify)) setDirectVisitId(modify.toLowerCase());
    if (query.get("view") === "clients") {
      setView("clients");
      const id = query.get("fiche");
      if (id && partnerClientIdPattern.test(id)) setClientId(id.toLowerCase());
    }
    if (query.get("view") === "stock") setView("stock");
    if (onMap) {
      setView("map");
      const visit = query.get("visite");
      const highlight = query.get("intervention");
      if (highlight && /^(private|sanispa):[a-f0-9-]{36}$/i.test(highlight)) setMapVisitId(highlight);
      else if (visit && partnerClientIdPattern.test(visit)) setMapVisitId("private:" + visit);
    }
    openNewClient.current = query.get("view") === "clients" && query.get("ajouter") === "1";
    if (query.get("nouvelle") === "1") setEditor({ type: "pickClient", id: crypto.randomUUID() });
    setDay(initial.day ?? plannerDate(new Date()));
  }, []);
  useEffect(() => {
    if (!directVisitId) return;
    const controller = new AbortController();
    setDirectError("");
    void plannerRequest(endpoint + "?" + new URLSearchParams({ section: "visit", id: directVisitId }), { signal: controller.signal })
      .then((result: PartnerPrivateVisitFile | null) => {
        if (!result || controller.signal.aborted) return;
        const visit = result.visit;
        if (partnerClientVisitTiming(visit.ends_at, Date.now()) === "past") {
          router.replace(partnerPrivateVisitPath(visit.id));
          return;
        }
        setDirectVisit(result);
        setEditor({ type: "visit", id: visit.id, client: visit.client, visit, withoutDate: visit.starts_at === null });
      }).catch(cause => { if (!controller.signal.aborted) setDirectError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [directVisitId, router]);
  useEffect(() => {
    if (!day || directVisitId) return;
    const controller = new AbortController();
    const { from, to } = plannerRange(day, period);
    const query = view === "agenda" || view === "map" ? new URLSearchParams({
      from: from.toISOString(), to: to.toISOString(),
      ...(view === "map" ? { map: "1" } : { queue: "1" }),
    })
      : view === "clients" && clientId
        ? new URLSearchParams({ section: "client", id: clientId, offset: String(historyOffset) })
        : new URLSearchParams({ section: view === "clients" && showDeleted ? "deleted-clients" : view, name: search, offset: String(offset) });
    setLoadError("");
    if (view === "clients" && clientId) setFileLoading(true);
    else if (view === "clients") setPage(null);
    else if (view === "stock") setInventory(null);
    else if (loadedAgenda.current !== query.toString()) setAgenda(null);
    void plannerRequest(endpoint + "?" + query, { signal: controller.signal }).then(result => {
      if (!result || controller.signal.aborted) return;
      if (view === "clients") {
        if (clientId) {
          setFile(result);
          return;
        }
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
    }).catch(error => { if (!controller.signal.aborted) setLoadError(partnerAuthError(error)); })
      .finally(() => { if (view === "clients" && clientId && !controller.signal.aborted) setFileLoading(false); });
    return () => controller.abort();
  }, [view, day, period, search, offset, revision, clientId, historyOffset, showDeleted, directVisitId]);


  const mappedId = mapped?.id;
  useEffect(() => {
    if (!mappedId) return;
    mapTitle.current?.focus();
  }, [mappedId]);

  useEffect(() => {
    if (!mapped?.city || mapped.latitude !== null) return;
    const controller = new AbortController();
    setLocating(true);
    void plannerRequest(endpoint, { signal: controller.signal, payload: { action: "locateClient", id: mapped.id } })
      .then(result => {
        if (!controller.signal.aborted && result?.client?.latitude != null)
          setMapped({ ...result.client, approximateLocation: result.approximateLocation });
      }).catch(() => { /* The address stays readable when geocoding is unavailable. */ })
      .finally(() => { if (!controller.signal.aborted) setLocating(false); });
    return () => { controller.abort(); setLocating(false); };
  }, [mapped]);

  function showClient(id: string | null) {
    setClientId(id);
    setFile(null);
    setHistoryOffset(0);
    setMapped(null);
    setEditor(null);
    setNotice("");
    setSavedVisit(null);
    setSavedClient(null);
    setLoadError("");
    window.history.replaceState(null, "", id ? partnerClientPath(id) : partnerClientsPath);
  }

  function changeView(next: typeof view, nextSelection = selection, highlight?: string) {
    if (saving || next === view && !highlight) return;
    mapDateVersion.current += 1;
    setMapped(null);
    setEditor(null);
    setSavedClient(null);
    setNotice("");
    setSavedVisit(null);
    setSaveError("");
    setGridError("");
    setOffset(0);
    setClientId(null);
    setShowDeleted(false);
    setView(next);
    setMapVisitId(highlight ?? null);
    setAppointmentToOpen(null);
    setDay(nextSelection.day);
    setPeriod(nextSelection.period);
    setWorkStatus(nextSelection.status);
    setTechnician(nextSelection.technician);
    window.history.replaceState(null, "", next === "clients" ? partnerClientsPath : next === "stock" ? partnerStockPath : workspacePath(next, nextSelection, highlight));
  }

  function openVisitOnMap(visit: VisitLocation, status: WorkFilterStatus = visit.startsAt ? "all" : "pending") {
    changeView("map", {
      day: visit.startsAt ? plannerDate(new Date(visit.startsAt)) : day, period: "day", status, technician: "all",
    }, "private:" + visit.id);
  }

  function updateSelection(changes: Partial<WorkspaceSelection>) {
    const next = { ...selection, ...changes };
    mapDateVersion.current += 1;
    setMapped(null);
    setMapVisitId(null);
    setAppointmentToOpen(null);
    setDay(next.day);
    setPeriod(next.period);
    setWorkStatus(next.status);
    setTechnician(next.technician);
    if (view === "agenda" || view === "map") window.history.replaceState(null, "", workspacePath(view, next));
  }

  async function goToNextAppointment(technician: string) {
    const version = mapDateVersion.current;
    const result = await plannerRequest(endpoint + "?" + new URLSearchParams({ section: "next-appointment", technician }));
    if (version !== mapDateVersion.current) return true;
    if (!result?.startsAt) return false;
    updateSelection({ day: plannerDate(new Date(result.startsAt)), period: "day", status: "scheduled" });
    return true;
  }

  async function saveFromGrid(payload: object, success: string, date?: Date) {
    if (saving) return false;
    setNotice("");
    setSavedVisit(null);
    setGridError("");
    setSaving(true);
    try {
      const result = await plannerRequest(endpoint, { payload });
      if (!result) return false;
      if (date) updateSelection({ day: plannerDate(date), status: workStatus === "pending" ? "all" : workStatus });
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

  const loadDrivingTour = useCallback(async (stops: (MapCoordinate | null)[], signal: AbortSignal): Promise<TourDrivingRoute> => {
    const route = await plannerRequest(endpoint, { payload: { action: "routeTour", stops }, signal });
    if (!route) throw new Error("Reconnectez-vous pour calculer la tournée.");
    return route;
  }, []);

  async function applyDrivingTour(tour: TourReschedule): Promise<TourApplyResult> {
    setSaving(true);
    try {
      const result = await plannerRequest(endpoint, { payload: { action: "applyTour", ...tour } });
      if (!result) throw new Error("Reconnectez-vous pour valider la tournée.");
      setRevision(current => current + 1);
      return result;
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

  function scheduleFromGrid(item: PlannerQueueEntry, start: Date, technician: string | null, duration: number) {
    if (!Number.isFinite(+start) || !Number.isInteger(duration) || duration < 1 || duration > 720) {
      setGridError("Choisissez un créneau et une durée entre 1 et 720 minutes.");
      return Promise.resolve(false);
    }
    return saveFromGrid({
      action: "schedulePendingVisit", source: item.source, id: item.id, expected_at: item.expectedAt,
      starts_at: start.toISOString(), ends_at: new Date(+start + duration * 60000).toISOString(), technician_id: technician,
    }, "Intervention planifiée.", start);
  }

  function edit(next: Editor) {
    setMapped(null);
    setSavedClient(null);
    setNotice("");
    setSavedVisit(null);
    setSaveError("");
    setEditor(next);
  }

  function chooseBookingClient(booking: Booking, client: PrivatePartnerClient) {
    edit({ type: "visit", id: booking.id, client, booking });
  }

  async function removeVisit(visit: PrivatePartnerVisit | PendingPrivatePartnerVisit) {
    setSaving(true);
    try {
      const result = await plannerRequest(endpoint, { payload: { action: "deleteVisit", id: visit.id, expected_at: visit.updated_at } });
      if (!result) throw new Error("Reconnectez-vous pour supprimer l’intervention.");
      if (directVisitId) {
        router.replace("/partenaire/interventions");
        return;
      }
      setEditor(null);
      setSavedVisit(null);
      setMapVisitId(null);
      setNotice("Intervention supprimée. La fiche client est conservée.");
      if (view === "map") window.history.replaceState(null, "", workspacePath("map", selection));
      setRevision(current => current + 1);
    } finally {
      setSaving(false);
    }
  }

  async function applyUnplan(url: string, payload: object, visit?: VisitLocation) {
    setSaving(true);
    try {
      if (!await plannerRequest(url, { payload })) throw new Error("Reconnectez-vous pour déplanifier l’intervention.");
      if (directVisitId) {
        router.replace(partnerPrivateVisitPath(directVisitId));
        return;
      }
      setEditor(null);
      setSavedVisit(visit ?? null);
      if (view === "map") {
        const highlight = visit ? "private:" + visit.id : undefined;
        setWorkStatus("pending");
        setMapVisitId(highlight ?? null);
        window.history.replaceState(null, "", workspacePath("map", { ...selection, status: "pending" }, highlight));
      }
      if (view === "clients") {
        setHistoryOffset(0);
      }
      setNotice("Le créneau a été retiré. L’intervention est de nouveau à planifier.");
      setRevision(current => current + 1);
    } finally { setSaving(false); }
  }

  function unplanVisit(visit: Pick<PrivatePartnerVisit, "id" | "updated_at">) {
    return applyUnplan(endpoint, { action: "unplanVisit", id: visit.id, expected_at: visit.updated_at }, { id: visit.id, startsAt: null });
  }

  function unplanAppointment(appointment: PlannerAppointment) {
    return appointment.source === "private" ? unplanVisit(appointment)
      : applyUnplan(`/api/partner/interventions/${appointment.id}`,
        { action: "cancel_appointment", start: appointment.starts_at, end: appointment.ends_at });
  }

  async function changeClientStatus(id: string, action: "deleteClient" | "restoreClient") {
    setSaving(true);
    try {
      const result = await plannerRequest(endpoint, { payload: { action, id } });
      if (!result) throw new Error("Reconnectez-vous pour gérer cette fiche.");
      if (action === "deleteClient") {
        setOffset(0);
        if (clientId === id) showClient(null);
        if (mapped?.id === id) setMapped(null);
        if (savedClient?.id === id) setSavedClient(null);
        if ((editor?.type === "client" || editor?.type === "visit") && editor.client?.id === id) setEditor(null);
        setNotice("La fiche client a été placée dans la corbeille.");
      } else {
        setNotice("La fiche client a été restaurée dans le carnet.");
        setOffset(0);
      }
      setRevision(value => value + 1);
    } finally { setSaving(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.type === "pickClient" || saving) return;
    const values = new FormData(event.currentTarget);
    const value = (name: string) => String(values.get(name) ?? "");
    const address = () => ({ street: value("street"), postal_code: value("postal_code"), city: value("city") });
    const contact = () => ({
      id: editor.id, name: value("name"), phone: value("phone"), email: value("email"),
      ...address(),
    });
    setSaveError("");
    setSaving(true);
    try {
      if (editor.type === "client" && !editor.booking) {
        const result = await plannerRequest(endpoint, {
          payload: { action: "saveClient", ...contact() },
        });
        if (!result) return;
        if (editor.client) setNotice("La fiche client a été enregistrée.");
        else setSavedClient(result.client);
        if (!editor.returnToMap && !clientId) {
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
        const slot = editor.booking?.slot;
        let start: Date | null = null;
        let end: Date | null = null;
        if (value("without_date") !== "on") {
          start = new Date(value("date") + "T" + value("start"));
          end = slot ? new Date(+start + Number(value("duration")) * 60000) : new Date(value("date") + "T" + value("end"));
          if (!slot && end < start) end.setDate(end.getDate() + 1);
          if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start)
            throw new Error("L’heure de fin doit être après l’heure de début.");
        }
        const id = editor.booking?.id ?? editor.id;
        const visit = { id, title: value("intervention_type"), description: value("description"),
          starts_at: start?.toISOString() ?? null, ends_at: end?.toISOString() ?? null, technician_id: value("technician_id") || null };
        const payload = editor.type === "client" ? { action: "createVisitWithClient", client: contact(), visit }
          : { action: "saveVisit", client_id: editor.client.id, expected_at: editor.visit?.updated_at, ...visit,
            ...(values.has("street") ? { address: address() } : {}),
            ...(values.has("spa_id") ? { spa_id: value("spa_id") || null } : {}) };
        const result = await plannerRequest(endpoint, { payload });
        if (!result) return;
        if (directVisitId) {
          router.replace(partnerPrivateVisitPath(directVisitId));
          return;
        }
        const saved = { id, startsAt: visit.starts_at };
        if (view === "clients" && clientId) {
          setEditor(null);
          setHistoryOffset(0);
        } else if (start && slot) {
          const date = plannerDate(start);
          setDay(date);
          setPeriod("day");
          setWorkStatus("all");
          setView("agenda");
          window.history.replaceState(null, "", workspacePath("agenda", { ...selection, day: date, period: "day", status: "all" }));
          setEditor(null);
        } else {
          openVisitOnMap(saved);
        }
        setSavedVisit(saved);
        const confirmation = start ? "Le rendez-vous a été enregistré." : "L’intervention a été ajoutée à la liste « À planifier ».";
        setNotice(editor.type === "client" ? confirmation + " La fiche client a été ajoutée au carnet." : confirmation);
        setRevision(current => current + 1);
      }
    } catch (error) {
      setSaveError(partnerAuthError(error));
    } finally {
      setSaving(false);
    }
  }

  const workItems = useMemo(() => agenda ? workspaceWorkItems(agenda, Date.now()) : null, [agenda]);
  const workById = new Map(workItems?.map(item => [item.id, item]));
  const visibleItems = workItems?.filter(item => matchesWorkFilters(item, workStatus, technician)) ?? [];
  const visibleIds = new Set(visibleItems.map(item => item.id));
  const agendaEntries = agenda ? [
    ...agenda.visits.map(visit => ({ ...visit, source: "private" as const })),
    ...agenda.sanispa.map(visit => ({ ...visit, source: "sanispa" as const })),
  ].sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at)) : null;
  const entries = agendaEntries?.filter(entry => visibleIds.has(entry.source + ":" + (entry.source === "private" ? entry.id : entry.diagnostic_id)));
  const clientFile = file?.client.id === clientId ? file : null;
  const team = (directVisitId ? directVisit?.technicians : view === "clients" ? clientId ? clientFile?.technicians : page?.technicians : agenda?.technicians) ?? [];
  const currentBooking = editor?.type === "client" || editor?.type === "visit" ? editor.booking : undefined;
  const allAppointments: PlannerAppointment[] = (agendaEntries ?? []).map(entry => entry.source === "private" ? {
    ...entry, title: entry.title + " · " + entry.client.name, movable: !entry.completed_at && !entry.field_started_at, address: partnerClientAddress(entry.client),
    workStatus: workById.get("private:" + entry.id)?.workStatus,
  } : {
    ...entry, id: entry.diagnostic_id,
    title: problemLabel(entry.diagnostic.problem_type) + " · " + (entry.diagnostic.customer?.name || "Client"),
    address: entry.diagnostic.customer?.address ?? undefined,
    description: entry.diagnostic.preview_description ?? undefined,
    workStatus: workById.get("sanispa:" + entry.diagnostic_id)?.workStatus,
    movable: workById.get("sanispa:" + entry.diagnostic_id)?.reschedule?.closed === false,
  });
  const appointments = allAppointments.filter(entry => visibleIds.has(entry.source + ":" + entry.id));
  const durations = resources?.durations ?? defaultInterventionDurations;
  const queue: PlannerQueueEntry[] = [
    ...(agenda?.pendingVisits ?? []).map(visit => ({
      id: visit.id, source: "private" as const, expectedAt: visit.updated_at, technicianId: visit.technician_id,
      title: visit.title, customer: visit.client.name, address: partnerClientAddress(visit.client), description: visit.description,
      durationMinutes: schedulingDuration(visit.title, durations),
      unplanReason: workById.get("private:" + visit.id)?.unplanReason,
      maintenanceDueOn: visit.maintenance_due_on,
    })),
    ...(agenda?.pendingDossiers ?? []).map(dossier => ({
      id: dossier.id, source: "sanispa" as const, expectedAt: null, technicianId: null,
      title: problemLabel(dossier.problem_type), customer: dossier.customer?.name || "Client", address: dossier.customer?.address ?? "",
      reference: dossier.public_reference, description: dossier.preview_description,
      durationMinutes: schedulingDuration(sanispaSchedulingType(dossier.problem_type), durations),
      unplanReason: workById.get("sanispa:" + dossier.id)?.unplanReason,
    })),
  ].filter(item => visibleIds.has(item.source + ":" + item.id));
  const unslotted = visibleItems.filter(item => !item.startsAt && (period === "month" || item.workStatus !== "pending"));
  const month = day && view === "agenda" && period === "month" ? plannerRange(day, "month") : null;
  const monthDays = month ? new Date(month.to.getFullYear(), month.to.getMonth(), 0).getDate() : 0;
  const monthIndent = month ? (month.from.getDay() + 6) % 7 : 0;
  const selectedPoint = useMemo<PartnerMapPoint[]>(() => mapped && mapped.latitude !== null && mapped.longitude !== null ? [{
    id: mapped.id, latitude: mapped.latitude, longitude: mapped.longitude, title: mapped.name, address: partnerClientAddress(mapped),
    detail: mapped.approximateLocation ? "Position approximative (commune)" : undefined,
  }] : [], [mapped]);
  const editingFromContact = view === "clients" && editor?.type === "visit";
  const editorPanel = editor && editor.type !== "pickClient" ? <PlannerEditor key={editor.type + editor.id} editor={editor} day={day} team={team} durations={durations}
    clientSpas={editor.type === "visit" && clientFile?.client.id === editor.client.id ? clientFile.spas : undefined}
    save={save} error={saveError} saving={saving} close={() => {
      if (directVisitId) router.replace(partnerPrivateVisitPath(directVisitId));
      else setEditor(null);
    }}
    back={currentBooking ? () => edit({ type: "pickClient", ...currentBooking }) : undefined}
    remove={removeVisit} unplan={unplanVisit} /> : null;

  if (directVisitId) return <AppShell compact>
    <PartnerNavigation current="Interventions" />
    <Link className={actionClass} href={partnerPrivateVisitPath(directVisitId)}>← Fiche d’intervention</Link>
    <h1 className="mb-4 text-3xl font-bold">Modifier l’intervention</h1>
    {directError ? <p role="alert" className="text-red-800">{directError}</p> : editorPanel ?? <p role="status">Chargement de l’intervention…</p>}
  </AppShell>;

  return <AppShell compact>
    <PartnerNavigation current={workspaceLabels[view]}
      selection={day ? selection : undefined} onWorkspaceView={changeView} />
    <h1 className="mb-4 text-3xl font-bold">{editingFromContact ? "Nouvelle intervention" : { agenda: "Mon planning", map: "Carte", clients: "Mes clients", stock: "Mon stock" }[view]}</h1>

    {view === "clients" && clientId ? <button type="button" disabled={saving} className={actionClass + " mb-3"} onClick={() => showClient(null)}>← Retour à mes clients</button> : null}
    {notice ? <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
      <p role="status">{notice}</p>
      {savedVisit ? <div className="flex flex-wrap gap-x-4">
        <Link className={actionClass} href={partnerPrivateVisitPath(savedVisit.id)}>Ouvrir la fiche terrain</Link>
        {view !== "map" ? <button type="button" className={actionClass} onClick={() => openVisitOnMap(savedVisit)}>Voir le rendez-vous sur la carte</button> : null}
        <Link className={actionClass} href="/partenaire/interventions">Retrouver dans Mes interventions</Link>
      </div> : null}
    </div> : null}
    {gridError && (view !== "agenda" || period === "month") ? <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{gridError}</p> : null}
    {savedClient && view === "clients" ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p role="status" className="break-words font-bold text-emerald-900">Fiche créée pour {savedClient.name}.</p>
      <div className="flex flex-wrap gap-x-4">
        <button type="button" className={actionClass} onClick={() => showClient(savedClient.id)}>Ouvrir la fiche</button>
        <button type="button" className={actionClass} onClick={() => edit({ type: "visit", id: crypto.randomUUID(), client: savedClient })}>Planifier une première visite</button>
      </div>
    </div> : null}
    {loadError ? <div className={panelClass}>
      <p role="alert" className="text-red-700">{loadError}</p>
      <button type="button" className={actionClass} onClick={() => setRevision(value => value + 1)}>Réessayer</button>
    </div> : null}
    {!loadError && (view === "clients" ? clientId ? !clientFile : !page : view === "stock" ? !inventory : !agenda) ? <p role="status">Chargement…</p> : null}

    {editor?.type === "pickClient" ? <SlotClientPicker key={editor.id} slot={editor.slot} team={team}
      choose={client => chooseBookingClient(editor, client)}
      add={() => edit({ type: "client", id: crypto.randomUUID(), booking: editor })}
      close={() => setEditor(null)} />
      : editorPanel}

    {mapped ? <section className={panelClass + " mb-4"} aria-labelledby="map-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="map-title" ref={mapTitle} tabIndex={-1} className="break-words text-xl font-bold">Adresse de {mapped.name}</h2>
        <button type="button" className={actionClass} onClick={() => setMapped(null)}>Fermer la carte</button>
      </div>
      {selectedPoint.length
        ? <PartnerPrivateMap key={mapped.id} points={selectedPoint} />
        : <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">{locating ? "Recherche de l’adresse…" : "L’adresse n’a pas été localisée avec assez de précision. Vérifiez le numéro, la rue et le code postal dans la fiche client."}</p>}
      <p className="mt-3 break-words">{partnerClientAddress(mapped) || "Adresse à compléter dans la fiche client."}</p>
      {mapped.approximateLocation ? <p className="text-sm text-sanispa-steel">Position approximative au niveau de la commune.</p> : null}
      {partnerClientAddress(mapped) ? <a href={partnerDirections(partnerClientAddress(mapped))} target="_blank" rel="noreferrer" className={actionClass}>Ouvrir l’itinéraire</a> : null}
    </section> : null}

    {view === "clients" && clientId && clientFile && !loadError && !editingFromContact ? <PartnerClientFile key={clientId} history={clientFile}
      offset={historyOffset} busy={saving} loading={fileLoading} onPage={setHistoryOffset}
      onEdit={() => edit({ type: "client", id: clientId, client: clientFile.client })}
      onAdd={spa => edit({ type: "visit", id: crypto.randomUUID(), client: clientFile.client, withoutDate: true, spaId: spa?.id })}
      onAddress={() => { setEditor(null); setMapped(clientFile.client); }}
      onSpasChanged={() => setRevision(value => value + 1)}
      onDeleteClient={() => changeClientStatus(clientId, "deleteClient")} /> : null}

    {view === "clients" && !clientId && page && !editingFromContact ? <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{showDeleted ? "Corbeille des fiches clients" : "Mon carnet clients"}</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={() => {
            setShowDeleted(value => !value); setSearch(""); setOffset(0); setEditor(null); setMapped(null); setNotice(""); setSavedClient(null);
          }}>{showDeleted ? "Retour au carnet" : "Corbeille"}</Button>
          {!showDeleted ? <Button type="button" disabled={saving} onClick={() => edit({ type: "client", id: crypto.randomUUID() })}>Ajouter un client</Button> : null}
        </div>
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
          {showDeleted ? <button type="button" className={actionClass} disabled={saving} onClick={() => {
            setGridError("");
            void changeClientStatus(client.id, "restoreClient").catch(error => setGridError(partnerAuthError(error)));
          }}>Restaurer la fiche<span className="sr-only"> de {client.name}</span></button> : <div className="flex flex-wrap gap-x-4">
            <button type="button" className={actionClass} disabled={saving} onClick={() => showClient(client.id)}>Ouvrir la fiche<span className="sr-only"> de {client.name}</span></button>
            <button type="button" className={actionClass} disabled={saving} onClick={() => edit({ type: "visit", id: crypto.randomUUID(), client })}>Planifier une intervention</button>
            <button type="button" className={actionClass} disabled={saving} onClick={() => edit({ type: "client", id: client.id, client })}>Modifier la fiche</button>
            {partnerClientAddress(client) ? <button type="button" className={actionClass} disabled={saving} onClick={() => { setEditor(null); setMapped(client); }}>Voir sur la carte</button> : null}
            <PartnerVisitDelete client disabled={saving} onDelete={() => changeClientStatus(client.id, "deleteClient")} />
          </div>}
        </li>)}
      </ul> : <p>{search ? "Aucun client trouvé." : showDeleted ? "La corbeille est vide." : "Ajoutez votre premier client pour planifier une intervention."}</p>}
      {offset || page.more ? <div className="mt-3 flex gap-3">
        <Button type="button" variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 30))}>Précédent</Button>
        <Button type="button" variant="secondary" disabled={!page.more} onClick={() => setOffset(value => value + 30)}>Suivant</Button>
      </div> : null}
    </section> : null}

    {view === "stock" && inventory ? <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Pièces détachées et spas</h2>
        <div className="flex flex-wrap items-center gap-3">
          <a className={actionClass} href="#stock-movements" onClick={() => setStockHistoryArticle(null)}>Historique des mouvements</a>
          <Button type="button" disabled={saving} onClick={() => edit({ type: "stock", id: crypto.randomUUID() })}>Ajouter un article</Button>
        </div>
      </div>
      <PartnerStockImport onImported={(imported, skipped) => {
        setNotice(`${imported} ${imported === 1 ? "article ajouté" : "articles ajoutés"}${skipped ? ` · ${skipped} ${skipped === 1 ? "doublon ignoré" : "doublons ignorés"}` : ""}.`);
        setOffset(0);
        setRevision(value => value + 1);
      }} />
      {inventory.stock.length ? <ul className="mt-3 divide-y divide-sanispa-line">
        {inventory.stock.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 py-3">
          <div className="min-w-0">
            <h3 className="break-words font-bold">{item.label}</h3>
            <p className="break-words text-sm">{stockLabels[item.category]}{item.reference ? " · " + item.reference : ""}</p>
            <p className="text-sm font-bold">{item.quantity} en stock</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            <button type="button" className={actionClass} disabled={saving} onClick={() => edit({ type: "stock", id: item.id, item })}>Modifier l’article</button>
            <a className={actionClass} href="#stock-movements" onClick={() => setStockHistoryArticle({ id: item.id, label: item.label })}>
              Voir les mouvements
            </a>
          </div>
        </li>)}
      </ul> : <p className="mt-3">Aucun article en stock pour le moment.</p>}
      {offset || inventory.more ? <div className="mt-3 flex gap-3">
        <Button type="button" variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 30))}>Précédent</Button>
        <Button type="button" variant="secondary" disabled={!inventory.more} onClick={() => setOffset(value => value + 30)}>Suivant</Button>
      </div> : null}
    </section> : null}
    {view === "stock" ? <PartnerStockHistory key={(stockHistoryArticle?.id ?? "all") + ":" + revision}
      article={stockHistoryArticle} clear={() => setStockHistoryArticle(null)} /> : null}

    {(view === "agenda" || view === "map") && day && !loadError ? <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{view === "map" ? "Carte des interventions" : period === "day" ? "Interventions du jour" : period === "week" ? "Interventions de la semaine" : "Calendrier du mois"}</h2>
        <button type="button" disabled={saving} className={actionClass} onClick={() => edit({ type: "pickClient", id: crypto.randomUUID() })}>Nouvelle intervention</button>
      </div>
      <PartnerWorkspaceFilters selection={selection} team={team} disabled={saving} onChange={updateSelection} />
      {view === "agenda" ? <PartnerPlanningResources resources={resources} error={resourceError} onChange={() => setResourceRevision(current => current + 1)} /> : null}
      {view === "agenda" && resources?.canManage ? <PartnerTeamAssignment refresh={resourceRevision} /> : null}
      {view === "agenda" && period !== "month" && agenda?.pendingVisits ? <PartnerScheduleGrid key={[day, period, workStatus, technician].join(":")} day={day} period={period} appointments={appointments}
        occupied={allAppointments} technicianFilter={technician} showQueue={workStatus === "all" || workStatus === "pending"} queue={queue}
        initialAppointment={appointmentToOpen} team={team} busy={saving} error={gridError} onMove={moveFromGrid}
        onSchedule={scheduleFromGrid} onUnplan={unplanAppointment} onWeekChange={day => updateSelection({ day })}
        onCreate={slot => edit({ type: "pickClient", id: crypto.randomUUID(), slot })}
        onAdd={async (id, name) => {
          const saved = await saveFromGrid({ action: "addTechnician", id, name }, "Technicien ajouté au planning.");
          if (saved) setResourceRevision(current => current + 1);
          return saved;
        }} /> : null}
      {view === "map" ? <>
        <PartnerTourMap items={workItems} team={team} durations={durations} period={period} scope={day} busy={saving} onBook={saveTourVisit} loadRoute={loadDrivingTour}
          applyTour={applyDrivingTour} reloadTour={() => setRevision(current => current + 1)} onNextAppointment={goToNextAppointment}
          status={workStatus} technician={technician} highlightId={mapVisitId}
          onVisit={visit => edit({ type: "visit", id: visit.id, client: visit.client, visit })}
          onUnplan={item => item.visit ? unplanVisit(item.visit) : applyUnplan(`/api/partner/interventions/${item.dossierId}`,
            { action: "cancel_appointment", start: item.startsAt, end: item.endsAt })}
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
              onClick={() => updateSelection({ day: localDate, period: "day" })}>
              <span className="block">{index + 1}</span>
              {count ? <span className="block text-sanispa-blue">{count} RDV</span> : null}
            </button>;
          })}
        </div>
      </> : null}
      {view === "agenda" && !month && entries?.length ? <ul className="divide-y divide-sanispa-line" aria-label="Interventions avec créneau">
        {entries.map((entry, index) => <li className="py-3" key={entry.source + (entry.source === "private" ? entry.id : entry.diagnostic_id)}>
          {view === "agenda" && period === "week" ? <p className="mb-1 text-sm font-bold capitalize">{new Date(entry.starts_at).toLocaleDateString("fr-FR", { dateStyle: "full" })}</p> : null}
          <p className="text-sm font-bold">{plannerTime(entry.starts_at)} – {plannerTime(entry.ends_at)}</p>
          {appointments[index].workStatus ? <p className="text-sm font-bold text-sanispa-blue">{workStatusLabels[appointments[index].workStatus!]}</p> : null}
          {team.find(technician => technician.id === entry.technician_id) ? <p className="text-sm">{team.find(technician => technician.id === entry.technician_id)?.name}</p> : null}
          {entries.some((other, i) => index !== i && other.technician_id === entry.technician_id && visitsOverlap(entry, other)) ? <p className="text-sm font-bold text-amber-800">Chevauchement avec un autre rendez-vous</p> : null}
          {entry.source === "private" ? <>
            <h3 className="break-words text-lg font-bold">{entry.title} · {entry.client.name}</h3>
            <p className="break-words text-sm">{partnerClientAddress(entry.client) || "Adresse à compléter dans la fiche client"}</p>
            {entry.description ? <p className="whitespace-pre-wrap break-words text-sm">{entry.description}</p> : null}
            <div className="flex flex-wrap gap-x-4">
              <button type="button" disabled={saving} className={actionClass}
                onClick={() => openVisitOnMap({ id: entry.id, startsAt: entry.starts_at }, appointments[index].workStatus)}>Voir sur la carte</button>
              <Link className={actionClass} href={partnerPrivateVisitPath(entry.id)}>Ouvrir la fiche terrain</Link>
              {appointments[index].movable ? <button type="button" disabled={saving} className={actionClass} onClick={() => edit({ type: "visit", id: entry.id, client: entry.client, visit: entry })}>Modifier le rendez-vous</button> : null}
              {appointments[index].movable && Date.parse(entry.starts_at) > Date.now() ? <PartnerVisitUnplan disabled={saving} onUnplan={() => unplanVisit(entry)} /> : null}
            </div>
          </> : <>
            <h3 className="break-words text-lg font-bold">{problemLabel(entry.diagnostic.problem_type)} · {entry.diagnostic.customer?.name || "Client"}</h3>
            {entry.diagnostic.customer?.address ? <p className="break-words text-sm">{entry.diagnostic.customer.address}</p> : null}
            <div className="flex flex-wrap gap-x-4">
              <Link className={actionClass} href={workItemPath({ id: "sanispa:" + entry.diagnostic_id, dossierId: entry.diagnostic_id, workStatus: appointments[index].workStatus })}>
                Ouvrir la fiche terrain
              </Link>
              {appointments[index].movable ? <>
                {period === "week" ? <button type="button" className={actionClass} disabled={saving} onClick={() => {
                  updateSelection({ day: plannerDate(new Date(entry.starts_at)), period: "day" });
                  setAppointmentToOpen(appointments[index]);
                }}>Modifier le rendez-vous</button> : null}
                {Date.parse(entry.starts_at) > Date.now() ? <PartnerVisitUnplan disabled={saving} onUnplan={() => unplanAppointment(appointments[index])} /> : null}
              </> : null}
            </div>
          </>}
        </li>)}
      </ul> : view === "agenda" && !month && entries ? <p>Aucune intervention prévue sur cette période.</p> : null}
      {view === "agenda" && unslotted.length ? <section className="mt-5 border-t border-sanispa-line pt-4" aria-label="Interventions sans créneau">
        <h3 className="text-base font-bold">Interventions sans créneau dans la grille</h3>
        <ul className="mt-2 divide-y divide-sanispa-line">{unslotted.map(item => <li key={item.id} className="py-2">
          <p className="break-words font-semibold">{item.title}</p>
          <p className="text-sm">{item.workStatus ? workStatusLabels[item.workStatus] : ""}</p>
          <Link className={actionClass} href={workItemPath(item)}>Ouvrir la fiche terrain</Link>
        </li>)}</ul>
      </section> : null}
    </section> : null}
  </AppShell>;
}

function slotSummary(slot: PlannerSlot, team: PlannerTechnician[]) {
  const date = new Date(slot.startsAt).toLocaleDateString("fr-FR", { dateStyle: "long" });
  const technician = team.find(member => member.id === slot.technicianId)?.name ?? "À affecter";
  return `${date} à ${plannerTime(slot.startsAt)} · ${technician}`;
}

function SlotClientPicker({ slot, team, choose, add, close }: {
  slot?: PlannerSlot; team: PlannerTechnician[]; choose: (client: PrivatePartnerClient) => void; add: () => void; close: () => void;
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
    <h2 id="booking-title" ref={heading} tabIndex={-1} className="text-xl font-bold">{slot ? "Nouveau rendez-vous" : "Nouvelle intervention"}</h2>
    <p className="mt-1 text-sm">{slot ? slotSummary(slot, team) : "Choisissez un client ou ajoutez sa fiche pour enregistrer l’intervention."}</p>
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

function PlannerEditor({ editor, day, team, durations, clientSpas, save, saving, error, close, back, remove, unplan }: {
  editor: FormEditor; day: string; team: PlannerTechnician[]; save: (event: FormEvent<HTMLFormElement>) => void;
  durations: InterventionDuration[];
  clientSpas?: PartnerClientSpa[];
  saving: boolean; error: string; close: () => void; back?: () => void;
  remove: (visit: PrivatePartnerVisit | PendingPrivatePartnerVisit) => Promise<void>;
  unplan: (visit: Pick<PrivatePartnerVisit, "id" | "updated_at">) => Promise<void>;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const slot = editor.type === "stock" ? undefined : editor.booking?.slot;
  const [withoutDate, setWithoutDate] = useState(editor.type === "visit" && editor.withoutDate !== undefined
    ? editor.withoutDate : editor.type !== "stock" && !!editor.booking && !slot);
  useEffect(() => { title.current?.focus(); }, []);
  const visit = editor.type === "visit" ? editor.visit : undefined;
  const newContact = editor.type === "client" && Boolean(editor.booking);
  const addressNeeded = editor.type === "visit" && !visit && !hasCompletePartnerAddress(editor.client);
  const forVisit = editor.type === "visit" || newContact;
  const startsAt = visit?.starts_at ?? slot?.startsAt;
  const startingDay = startsAt ? plannerDate(new Date(startsAt)) : day;
  const [type, setType] = useState(visit?.title ?? defaultInterventionDurations[0].label);
  const [startTime, setStartTime] = useState(startsAt ? plannerTime(startsAt) : "09:00");
  const [customDuration, setCustomDuration] = useState<string | null>(null);
  const [endOverride, setEndOverride] = useState(visit?.ends_at ? plannerTime(visit.ends_at) : null);
  const defaultMinutes = schedulingDuration(type, durations);
  const endTime = endOverride ?? (startTime ? plannerTime(new Date(+new Date("2000-01-01T" + startTime) + defaultMinutes * 60000).toISOString()) : "");
  return <section className={panelClass + " mb-4"}>
    <h2 ref={title} tabIndex={-1} className="break-words text-xl font-bold">
      {editor.type === "client" ? editor.client ? "Modifier la fiche client" : newContact ? "Intervention pour un nouveau client" : "Ajouter un client"
        : editor.type === "stock" ? editor.item ? "Modifier l’article" : "Ajouter un article"
        : `Intervention chez ${editor.client.name}`}
    </h2>
    {editor.type === "client" && slot ? <p className="mt-2 text-sm">{slotSummary(slot, team)}</p> : null}
    {newContact ? <p className="mt-2 text-sm">Les coordonnées seront enregistrées dans votre carnet avec l’intervention.</p> : null}
    {editor.type === "visit" && !addressNeeded ? <p className="mt-2 break-words text-sm">{partnerClientAddress(editor.client)}</p> : null}
    <form ref={formRef} onSubmit={save}>
      <fieldset disabled={saving} className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {editor.type === "client" ? <>
          <PlannerField label="Nom du client" name="name" maxLength={140} defaultValue={editor.client?.name} required />
          <PlannerField label="Téléphone (facultatif)" name="phone" type="tel" maxLength={35} defaultValue={editor.client?.phone} />
          <PlannerField label="E-mail (facultatif)" name="email" type="email" maxLength={254} defaultValue={editor.client?.email} />
          <PlannerClientAddressFields client={editor.client} />
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
        </> : null}
        {forVisit ? <>
          {addressNeeded ? <PlannerClientAddressFields client={editor.client} completing /> : null}
          {editor.type === "visit" ? <VisitSpaField clientId={editor.client.id} knownSpas={clientSpas} selected={editor.spaId ?? visit?.spa_id} /> : null}
          <InterventionFields type={visit?.title} durations={durations} onType={value => {
            setType(value);
            if (!visit?.starts_at) { setCustomDuration(null); setEndOverride(null); }
          }} description={visit?.description} />
          {!slot && (!visit || visit.starts_at === null) ? <label className="flex min-h-11 items-center gap-2 text-sm font-bold sm:col-span-2">
            <input type="checkbox" name="without_date" checked={withoutDate} onChange={event => setWithoutDate(event.target.checked)} />
            Ajouter à « À planifier » sans fixer de date
          </label> : null}
          <PlannerField label="Jour de l’intervention" name="date" type="date" min="1900-01-01" max="2099-12-31" defaultValue={startingDay} required disabled={withoutDate} hidden={withoutDate} />
          <PlannerField label="Heure de début" name="start" type="time" value={startTime} onChange={event => setStartTime(event.target.value)} required disabled={withoutDate} hidden={withoutDate} />
          {slot ? <PlannerField label="Durée (en minutes)" name="duration" type="number" min={1} max={720}
            value={customDuration ?? defaultMinutes} onChange={event => setCustomDuration(event.target.value)} required />
            : <PlannerField label="Heure de fin" name="end" type="time" value={endTime} onChange={event => setEndOverride(event.target.value)} required disabled={withoutDate} hidden={withoutDate} />}
          <PlannerTechnicianSelect team={team} selected={visit?.technician_id ?? slot?.technicianId} />
          {!withoutDate && !visit?.starts_at ? <div className="sm:col-span-2">
            <PartnerSlotSuggestions search={() => {
              if (!formRef.current) return null;
              const values = new FormData(formRef.current);
              const date = String(values.get("date") || "");
              const difference = (+new Date(date + "T" + endTime) - +new Date(date + "T" + startTime)) / 60000;
              return { day: date, duration: slot ? Number(values.get("duration")) : difference < 0 ? difference + 1440 : difference,
                technician: String(values.get("technician_id") || "") };
            }} select={candidate => {
              fillPlannerSlot(formRef.current, candidate);
              setStartTime(plannerTime(candidate.starts_at));
              setEndOverride(plannerTime(candidate.ends_at));
            }} />
          </div> : null}
        </> : null}
        {error ? <p role="alert" className="text-sm font-bold text-red-700 sm:col-span-2">{error}</p> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit">{saving ? "Enregistrement…" : editor.type === "client" && !newContact ? "Enregistrer le client"
            : editor.type === "stock" ? "Enregistrer l’article" : withoutDate ? "Ajouter à planifier" : "Enregistrer le rendez-vous"}</Button>
          {back ? <Button type="button" variant="secondary" onClick={back}>Changer de client</Button> : null}
          <Button type="button" variant="secondary" onClick={close}>Annuler</Button>
        </div>
      </fieldset>
    </form>
    {visit ? <div className="mt-2 flex flex-wrap gap-x-4">
      {visit.starts_at ? <PartnerVisitUnplan disabled={saving} onUnplan={() => unplan(visit)} /> : null}
      <PartnerVisitDelete disabled={saving} onDelete={() => remove(visit)} />
    </div> : null}
  </section>;
}

function PlannerClientAddressFields({ client, completing }: { client?: PrivatePartnerClient; completing?: boolean }) {
  return <fieldset className="min-w-0 rounded-xl border border-sanispa-line p-3 sm:col-span-2">
    <legend className="px-1 text-sm font-bold">Adresse du client (obligatoire)</legend>
    {completing ? <p className="mb-2 text-sm">L’adresse sera enregistrée dans la fiche client avec l’intervention.</p> : null}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2"><PlannerField label="Numéro et nom de rue" name="street" required maxLength={160} defaultValue={client?.street} /></div>
      <PlannerField label="Code postal" name="postal_code" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue={client?.postal_code} />
      <PlannerField label="Ville" name="city" required maxLength={100} defaultValue={client?.city} />
    </div>
  </fieldset>;
}

function VisitSpaField({ clientId, knownSpas, selected }: { clientId: string; knownSpas?: PartnerClientSpa[]; selected?: string | null }) {
  const [options, setOptions] = useState<PartnerClientSpa[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (knownSpas) return;
    const controller = new AbortController();
    void plannerRequest(endpoint + "?" + new URLSearchParams({ section: "client-spas", id: clientId }), { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted && result) setOptions(result.spas); })
      .catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [clientId, knownSpas]);

  const spas = knownSpas ?? options;
  if (error && !spas) return <p role="status" className="text-sm text-amber-800">Liste des spas indisponible. {error}</p>;
  if (!spas) return <p role="status" className="text-sm">Chargement des spas du client…</p>;
  if (!spas.length) return <p className="text-sm sm:col-span-2">Ajoutez les spas dans la fiche client pour les choisir ici.</p>;
  return <label className="min-w-0 text-sm font-bold sm:col-span-2">Spa concerné
    <select name="spa_id" className={inputClass + " mt-1"} defaultValue={selected ?? ""}><PartnerSpaOptions spas={spas} /></select>
  </label>;
}

function InterventionFields({ type = defaultInterventionDurations[0].label, description, durations, onType }: {
  type?: string; description?: string; durations: InterventionDuration[]; onType: (type: string) => void;
}) {
  const [selection, setSelection] = useState(type);
  const [customType, setCustomType] = useState(durations.some(item => item.label === type) ? "" : type);
  const known = durations.some(item => item.label === selection);
  const selected = known ? selection : "";
  return <>
    <label className="min-w-0 text-sm font-bold">Type d’intervention
      <select name={known ? "intervention_type" : undefined} value={selected}
        className={inputClass + " mt-1"} onChange={event => {
          setSelection(event.target.value);
          onType(event.target.value || customType);
        }}>
        {durations.map(item => <option key={item.label} value={item.label}>{item.label} · {item.duration_minutes} min</option>)}
        <option value="">Type personnalisé</option>
      </select>
    </label>
    {!known ? <PlannerField label="Nom du type personnalisé" name="intervention_type" maxLength={140}
      value={customType} onChange={event => { setCustomType(event.target.value); onType(event.target.value); }} required /> : null}
    <label className="min-w-0 text-sm font-bold sm:col-span-2">Descriptif de la panne ou de l’intervention (facultatif)
      <textarea name="description" rows={3} maxLength={2500} defaultValue={description} className={inputClass + " mt-1"} />
    </label>
  </>;
}

function PlannerField({ label, hidden, ...input }: React.ComponentProps<"input"> & { label: string }) {
  return <label hidden={hidden} className="min-w-0 text-sm font-bold">{label}<input {...input} className={inputClass + " mt-1"} /></label>;
}
