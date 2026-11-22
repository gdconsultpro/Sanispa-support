"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/Button";
import { fillPlannerSlot, PartnerSlotSuggestions } from "@/components/PartnerSlotSuggestions";
import { PartnerVisitUnplan } from "@/components/PartnerVisitUnplan";
import {
  plannerDate, plannerDay, plannerRange, plannerTime, timelineDropTime, timelineQuarter, visitsOverlap,
  type PlannerAppointment, type PlannerQueueEntry, type PlannerSlot, type PlannerTechnician,
} from "@/lib/partner-planner";
import { workItemPath, workStatusLabels } from "@/lib/partner-workspace";
import { maintenanceDate } from "@/lib/partner-maintenance";

const hour = 3600000;
const inputClass = "focus-ring min-h-12 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-3 py-2 text-base";

export function PlannerTechnicianSelect({ team, selected }: { team: PlannerTechnician[]; selected?: string | null }) {
  const id = useId();
  return <div className="min-w-0">
    <label htmlFor={id} className="mb-1 block text-sm font-bold">Technicien</label>
    <select id={id} name="technician_id" className={inputClass} defaultValue={selected ?? ""}>
      <option value="">À affecter</option>
      {team.map(technician => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
    </select>
  </div>;
}

const searchable = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const defaultDuration = 60;
const weekDayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const weekArrowClass = "focus-ring grid h-11 w-11 place-items-center rounded-lg border border-sanispa-line bg-white text-sanispa-blue hover:border-sanispa-blue disabled:opacity-50";
const dragType = "application/x-sanispa-intervention";
type ActiveDrag = { appointment: PlannerAppointment; offset: number } | { item: PlannerQueueEntry };

export function PartnerScheduleGrid({ day, period, appointments, occupied, technicianFilter, showQueue, queue, team, busy, error, initialAppointment, onAdd, onMove, onCreate, onSchedule, onUnplan, onWeekChange }: {
  day: string;
  period: "day" | "week";
  appointments: PlannerAppointment[];
  occupied: PlannerAppointment[];
  technicianFilter: string;
  showQueue: boolean;
  queue: PlannerQueueEntry[];
  team: PlannerTechnician[];
  busy: boolean;
  error?: string;
  initialAppointment?: PlannerAppointment | null;
  onAdd: (id: string, name: string) => Promise<boolean>;
  onMove: (appointment: PlannerAppointment, start: Date, technician: string | null) => Promise<boolean>;
  onCreate: (slot: PlannerSlot) => void;
  onSchedule: (item: PlannerQueueEntry, start: Date, technician: string | null, duration: number) => Promise<boolean>;
  onUnplan: (appointment: PlannerAppointment) => Promise<void>;
  onWeekChange: (day: string) => void;
}) {
  const [selected, setSelected] = useState(initialAppointment ?? null);
  const [booking, setBooking] = useState<{ item: PlannerQueueEntry; slot: PlannerSlot } | null>(null);
  const [query, setQuery] = useState("");
  const [newTechnician, setNewTechnician] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [focusedDay, setFocusedDay] = useState(day);
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const bookingForm = useRef<HTMLFormElement>(null);
  const drag = useRef<ActiveDrag | null>(null);
  const range = plannerRange(day, period);
  const start = +range.from;
  const end = +range.to;
  const elapsed = end - start;
  const length = elapsed / hour;
  const rows = [{ id: "", name: "À affecter" }, ...team].filter(row => technicianFilter === "all" || row.id === technicianFilter);
  const focusStart = +plannerDay(focusedDay);
  const focusEnd = +plannerDay(focusedDay, 1);
  const firstVisit = occupied.find(appointment => Date.parse(appointment.starts_at) >= focusStart && Date.parse(appointment.starts_at) < focusEnd)?.starts_at;
  const firstVisible = firstVisit ? Math.max(focusStart, Date.parse(firstVisit) - hour) : +new Date(focusedDay + "T08:00");
  const columnWidth = period === "week" ? 70 : 96;
  const days = period === "week" ? Array.from({ length: 7 }, (_, index) => plannerDay(plannerDate(range.from), index)) : [];
  const terms = searchable(query).trim().split(/\s+/).filter(Boolean);
  const visibleQueue = terms.length ? queue.filter(item => {
    const text = searchable([item.customer, item.title, item.reference, item.address, item.description].join(" "));
    return terms.every(term => text.includes(term));
  }) : queue;

  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = (firstVisible - start) / hour * columnWidth;
  }, [firstVisible, start, columnWidth]);

  function focusDate(date: Date) {
    const day = plannerDate(date);
    setFocusedDay(day);
    if (day === focusedDay && scroll.current) scroll.current.scrollLeft = (firstVisible - start) / hour * columnWidth;
  }

  useEffect(() => { if (selected || booking || newTechnician) heading.current?.focus(); }, [selected, booking, newTechnician]);

  function finishDrag() {
    drag.current = null;
    setOver(null);
  }

  function beginDrag(event: DragEvent, value: ActiveDrag) {
    const pending = "item" in value;
    const item = pending ? value.item : value.appointment;
    const key = [pending ? "pending" : "appointment", item.source, item.id].join(":");
    drag.current = value;
    event.dataTransfer.setData("text/plain", "sanispa:" + key);
    event.dataTransfer.setData(dragType, key);
    event.dataTransfer.effectAllowed = "move";
  }

  function selectBooking(item: PlannerQueueEntry, slot: PlannerSlot) {
    setSelected(null);
    setNewTechnician(null);
    setBooking({ item, slot });
  }

  function drop(event: DragEvent<HTMLDivElement>, technician: string) {
    const key = event.dataTransfer.getData(dragType) || event.dataTransfer.getData("text/plain").replace(/^sanispa:/, "");
    const [kind, source, id] = key.split(":");
    const pending = kind === "pending" ? queue.find(item => item.id === id && item.source === source) : undefined;
    const existing = kind === "appointment" ? appointments.find(item => item.id === id && item.source === source && item.movable) : undefined;
    const current = drag.current ?? (pending ? { item: pending } : existing ? { appointment: existing, offset: 0 } : null);
    if (!current || busy) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const time = start + ((event.clientX - rect.left) / rect.width) * elapsed - ("offset" in current ? current.offset : 0);
    const duration = "appointment" in current
      ? Date.parse(current.appointment.ends_at) - Date.parse(current.appointment.starts_at) : (current.item.durationMinutes ?? defaultDuration) * 60000;
    const next = timelineDropTime(start, end, time, duration);
    finishDrag();
    if ("appointment" in current) {
      void onMove(current.appointment, new Date(next), technician || null).then(saved => { if (saved) setSelected(null); });
    } else {
      void onSchedule(current.item, new Date(next), technician || null, duration / 60000).then(saved => { if (saved) setBooking(null); });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    if (newTechnician) {
      const name = String(fields.get("name") ?? "").trim();
      if (name && await onAdd(newTechnician, name)) setNewTechnician(null);
    } else if (selected || booking) {
      const date = new Date(`${fields.get("date")}T${fields.get("time")}`);
      const technician = String(fields.get("technician_id") || "") || null;
      if (selected && await onMove(selected, date, technician)) setSelected(null);
      if (booking && await onSchedule(booking.item, date, technician, Number(fields.get("duration")))) setBooking(null);
    }
  }

  return <div className="mb-5 min-w-0">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-bold">Grille par technicien</h3>
      <Button type="button" disabled={busy} variant="secondary" onClick={() => { setSelected(null); setBooking(null); setNewTechnician(crypto.randomUUID()); }}>
        Ajouter un technicien
      </Button>
    </div>
    {error ? <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
    <p className="mb-3 text-sm text-sanispa-steel">{showQueue
      ? "Glissez une intervention sur un créneau ou sélectionnez-la pour choisir l’heure."
      : "Ouvrez un rendez-vous pour consulter sa fiche et les actions disponibles."}</p>
    {selected || booking || newTechnician ? <section className="mb-3 rounded-xl bg-sanispa-ice p-4">
      <h4 ref={heading} tabIndex={-1} className="font-bold">{selected ? "Rendez-vous" : booking ? "Planifier l’intervention" : "Ajouter un technicien au planning"}</h4>
      {selected ? <>
        {selected.workStatus ? <p className="mt-1 text-sm font-bold text-sanispa-blue">{workStatusLabels[selected.workStatus]}</p> : null}
        <p className="mt-1 break-words font-semibold">{selected.title}</p>
        <p className="text-sm">{plannerTime(selected.starts_at)}–{plannerTime(selected.ends_at)} · {team.find(member => member.id === selected.technician_id)?.name ?? "À affecter"}</p>
        {selected.address ? <p className="break-words text-sm">{selected.address}</p> : null}
        {selected.description ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{selected.description}</p> : null}
        <div className="mt-3">
          <ButtonLink href={workItemPath({ id: selected.id, dossierId: selected.source === "sanispa" ? selected.id : undefined, workStatus: selected.workStatus })}>
            Ouvrir la fiche terrain
          </ButtonLink>
        </div>
      </> : booking ? <p className="mt-1 break-words text-sm">{booking.item.customer} · {booking.item.title}</p> : null}
      {booking?.item.maintenanceDueOn ? <p className="mt-1 break-words text-sm">
        {booking.item.description} · Échéance du {maintenanceDate(booking.item.maintenanceDueOn)}
      </p> : null}
      {!selected || selected.movable ? <form ref={bookingForm} onSubmit={submit} key={booking ? booking.item.id + booking.slot.startsAt + booking.slot.technicianId : selected?.id ?? newTechnician}>
        <fieldset disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {selected || booking ? <>
            <label className="min-w-0 text-sm font-bold">Date
              <input name="date" type="date" required min="1900-01-01" max="2099-12-31" defaultValue={plannerDate(new Date(selected?.starts_at ?? booking!.slot.startsAt))} className={inputClass + " mt-1"} />
            </label>
            <label className="min-w-0 text-sm font-bold">Heure de début
              <input name="time" type="time" required defaultValue={plannerTime(selected?.starts_at ?? booking!.slot.startsAt)} className={inputClass + " mt-1"} />
            </label>
            {booking ? <label className="min-w-0 text-sm font-bold">Durée en minutes
              <input name="duration" type="number" required min={1} max={720} defaultValue={booking.item.durationMinutes ?? defaultDuration} className={inputClass + " mt-1"} />
            </label> : null}
            <PlannerTechnicianSelect team={team} selected={selected?.technician_id ?? booking?.slot.technicianId} />
            {booking ? <div className="sm:col-span-2 xl:col-span-4">
              <PartnerSlotSuggestions search={() => {
                if (!bookingForm.current) return null;
                const form = new FormData(bookingForm.current);
                return { day: String(form.get("date")), duration: Number(form.get("duration")), technician: String(form.get("technician_id") || "") };
              }} select={slot => fillPlannerSlot(bookingForm.current, slot, { day: "date", time: "time", technician: "technician_id" })} />
            </div> : null}
          </> : <label className="min-w-0 text-sm font-bold sm:col-span-2">Nom du technicien
            <input name="name" required maxLength={100} className={inputClass + " mt-1"} />
          </label>}
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
            <Button type="submit">{busy ? "Enregistrement…" : selected ? "Enregistrer le rendez-vous" : booking ? "Planifier" : "Enregistrer le technicien"}</Button>
            {!selected ? <Button type="button" variant="secondary" onClick={() => { setBooking(null); setNewTechnician(null); }}>Annuler</Button> : null}
          </div>
        </fieldset>
      </form> : null}
      {selected ? <div className="mt-2 flex flex-wrap items-center gap-x-4">
        {selected.movable && Date.parse(selected.starts_at) > Date.now() ? <PartnerVisitUnplan key={selected.source + selected.id} disabled={busy} onUnplan={async () => {
          await onUnplan(selected);
          setSelected(null);
        }} /> : null}
        <button type="button" className="focus-ring min-h-11 text-sm font-bold underline" disabled={busy} onClick={() => setSelected(null)}>Fermer</button>
      </div> : null}
    </section> : null}
    <div className={`grid min-w-0 gap-3 ${showQueue ? "lg:grid-cols-[minmax(14rem,19rem)_minmax(0,1fr)]" : ""}`}>
    {showQueue ? <section aria-labelledby="queue-heading" className="min-w-0 rounded-xl border border-sanispa-line bg-sanispa-ice p-3">
      <h4 id="queue-heading" className="font-bold">À planifier <span className="text-sanispa-blue">({queue.length})</span></h4>
      <label className="mt-2 block text-sm font-bold">Rechercher une intervention
        <input type="search" value={query} maxLength={140} onChange={event => setQuery(event.target.value)} className={inputClass + " mt-1"}
          placeholder="Client, ville, panne…" />
      </label>
      <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto lg:max-h-[30rem]">
        {visibleQueue.map(item => <li key={item.source + item.id} draggable={!busy}
          onDragStart={event => {
            if (busy) { event.preventDefault(); return; }
            beginDrag(event, { item });
          }}
          onDragEnd={finishDrag}>
          <button type="button" disabled={busy}
            aria-pressed={booking?.item.id === item.id && booking.item.source === item.source}
            onClick={() => {
              const today = new Date();
              const defaultStart = new Date(focusedDay + "T08:00");
              const nextQuarter = Math.ceil(+today / (15 * 60000)) * 15 * 60000;
              const startsAt = (plannerDate(today) === focusedDay && nextQuarter > +defaultStart ? new Date(nextQuarter) : defaultStart).toISOString();
              selectBooking(item, { startsAt, technicianId: item.technicianId });
            }}
            className="focus-ring w-full break-words rounded-lg border border-sanispa-line bg-white p-2.5 text-left text-sm aria-pressed:border-sanispa-blue aria-pressed:bg-blue-50 lg:cursor-grab">
            <span className="block font-bold">{item.customer}</span>
            <span className="block">{item.title} · {item.durationMinutes ?? defaultDuration} min</span>
            {item.maintenanceDueOn ? <>
              <span className="block text-xs font-semibold text-sanispa-blue">Échéance du {maintenanceDate(item.maintenanceDueOn)}</span>
              <span className="block text-xs">{item.description}</span>
            </> : null}
            {item.unplanReason ? <span className="mt-1 block text-xs font-semibold text-sanispa-blue">À replanifier · {item.unplanReason}</span> : null}
            <span className="block text-xs text-sanispa-steel">{[item.reference ?? (item.source === "sanispa" ? "SANISPA" : ""), item.address].filter(Boolean).join(" · ")}</span>
          </button>
          <Link draggable={false} className="focus-ring inline-flex min-h-11 items-center px-2.5 text-sm font-bold text-sanispa-blue underline"
            href={workItemPath({ id: item.id, dossierId: item.source === "sanispa" ? item.id : undefined, workStatus: "pending" })}>
            Ouvrir la fiche terrain
          </Link>
        </li>)}
      </ul>
      {!visibleQueue.length ? <p role="status" className="mt-2 text-sm">{queue.length ? "Aucun résultat." : "Aucune intervention à planifier."}</p> : null}
    </section> : null}
    <div className="min-w-0">
    {days.length ? <div className="mb-2 grid w-fit max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2" role="group" aria-label="Navigation hebdomadaire de la grille">
      <button type="button" aria-label="Semaine précédente" title="Semaine précédente" disabled={busy} className={weekArrowClass}
        onClick={() => onWeekChange(plannerDate(plannerDay(focusedDay, -7)))}>
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Accès aux jours de la grille">
        {days.map(date => <button key={+date} type="button" aria-pressed={plannerDate(date) === focusedDay} onClick={() => focusDate(date)}
          className="focus-ring min-h-11 rounded-lg border border-sanispa-line px-2.5 text-sm font-semibold capitalize aria-pressed:bg-sanispa-blue aria-pressed:text-white">
          {weekDayLabel.format(date)}
        </button>)}
      </div>
      <button type="button" aria-label="Semaine suivante" title="Semaine suivante" disabled={busy} className={weekArrowClass}
        onClick={() => onWeekChange(plannerDate(plannerDay(focusedDay, 7)))}>
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div> : null}
    <div ref={scroll} tabIndex={0} role="region" aria-label="Grille horaire des interventions" className="focus-ring isolate max-w-full overflow-x-auto rounded-xl border border-sanispa-line">
      <div className="w-max" role="table" aria-label={period === "week" ? "Rendez-vous de la semaine par technicien" : "Rendez-vous de la journée par technicien"}>
        {days.length ? <div role="row" className="flex border-b border-sanispa-line bg-sanispa-ice text-sm font-bold">
          <div role="columnheader" className="sticky left-0 z-10 w-28 shrink-0 border-r border-sanispa-line bg-sanispa-ice px-2 py-2 sm:w-44">Semaine</div>
          {days.map(date => <div role="columnheader" key={+date} className="relative shrink-0 border-r border-sanispa-line"
            style={{ width: (+plannerDay(plannerDate(date), 1) - +date) / hour * columnWidth }}>
            <span className="sticky left-28 inline-block bg-sanispa-ice px-2 py-2 capitalize sm:left-44">{weekDayLabel.format(date)}</span>
          </div>)}
        </div> : null}
        <div role="row" className="flex border-b border-sanispa-line bg-sanispa-ice text-sm">
          <div role="columnheader" className="sticky left-0 z-10 flex w-28 shrink-0 items-center border-r border-sanispa-line bg-sanispa-ice px-2 font-bold sm:w-44">Technicien</div>
          {Array.from({ length }, (_, index) => (
            <div role="columnheader" key={index} className="shrink-0 border-r border-sanispa-line px-2 py-2 font-semibold" style={{ width: columnWidth }}>
              {plannerTime(new Date(start + index * hour).toISOString())}
            </div>
          ))}
        </div>
        {rows.map(row => {
          const occupiedRow = occupied.filter(appointment => (appointment.technician_id ?? "") === row.id);
          const endByLane: number[] = [];
          const slots = appointments.filter(appointment => (appointment.technician_id ?? "") === row.id)
            .map(appointment => {
              const begins = Math.max(start, Date.parse(appointment.starts_at));
              const ends = Math.min(end, Date.parse(appointment.ends_at));
              let lane = endByLane.findIndex(last => last <= begins);
              if (lane < 0) lane = endByLane.length;
              endByLane[lane] = ends;
              return { appointment, begins, ends, lane };
            });
          function free(time: number) {
            return occupiedRow.every(slot => time < Date.parse(slot.starts_at) || time >= Date.parse(slot.ends_at));
          }
          return <div role="row" key={row.id} className="flex border-b border-sanispa-line last:border-0">
            <div role="rowheader" className="sticky left-0 z-10 flex w-28 shrink-0 items-start break-words border-r border-sanispa-line bg-white px-2 py-3 text-sm font-bold sm:w-44">
              <span className="min-w-0">{row.name}</span>
            </div>
            <div role="cell" aria-colspan={length} aria-label={`Créneaux pour ${row.name}`} data-technician={row.id}
              className={`relative shrink-0 ${over === row.id ? "bg-sanispa-ice" : "bg-white"}`}
              style={{
                width: length * columnWidth, minHeight: Math.max(1, endByLane.length) * 54 + 8,
                backgroundImage: "linear-gradient(to right, transparent calc(100% - 1px), #d6e5f1 0)",
                backgroundSize: `${columnWidth}px 100%`,
              }}
              onDragOver={event => {
                if (busy || !drag.current && !event.dataTransfer.types.includes(dragType)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOver(row.id);
              }}
              onDrop={event => drop(event, row.id)}>
              <div className="absolute inset-0 flex">
                {Array.from({ length }, (_, index) => {
                  const hourStart = start + index * hour;
                  const firstFree = [0, 0.25, 0.5, 0.75].map(fraction => timelineQuarter(hourStart, fraction)).find(free);
                  const label = firstFree === undefined ? undefined
                    : `${booking ? "Choisir le créneau de" : "Créer un rendez-vous à"} ${plannerTime(new Date(firstFree).toISOString())} · ${row.name}${period === "week" ? " · " + weekDayLabel.format(new Date(firstFree)) : ""}`;
                  return <button type="button" key={hourStart} aria-label={label} disabled={busy || firstFree === undefined}
                    className="focus-ring flex shrink-0 items-center justify-center text-lg font-bold text-transparent hover:bg-sanispa-ice hover:text-sanispa-blue focus-visible:bg-sanispa-ice focus-visible:text-sanispa-blue disabled:pointer-events-none"
                    style={{ width: columnWidth }}
                    title={label}
                    onClick={event => {
                      if (firstFree === undefined || drag.current) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const time = event.detail === 0 ? firstFree : timelineQuarter(hourStart, (event.clientX - rect.left) / rect.width);
                      if (!free(time)) return;
                      const slot = { startsAt: new Date(time).toISOString(), technicianId: row.id || null };
                      if (booking) selectBooking(booking.item, slot);
                      else {
                        setNewTechnician(null);
                        setSelected(null);
                        onCreate(slot);
                      }
                    }}>
                    <span aria-hidden="true">+</span>
                  </button>;
                })}
              </div>
              {slots.map(({ appointment, begins, ends, lane }) => {
                const overlap = occupiedRow.some(other => (other.id !== appointment.id || other.source !== appointment.source) && visitsOverlap(appointment, other));
                const time = `${plannerTime(appointment.starts_at)}–${plannerTime(appointment.ends_at)}`;
                const status = appointment.workStatus ? workStatusLabels[appointment.workStatus] : "";
                const draggable = appointment.movable && !busy && begins === Date.parse(appointment.starts_at);
                return <button type="button" key={appointment.source + appointment.id}
                  draggable={draggable} disabled={busy}
                  title={`${appointment.title} · ${time}${status ? " · " + status : ""}${overlap ? " · Chevauchement" : ""}`}
                  aria-label={`Ouvrir le rendez-vous ${appointment.title}, ${time}${status ? ", " + status : ""}${overlap ? ", chevauchement" : ""}`}
                  className={`focus-ring absolute z-[1] flex h-12 min-w-0 flex-col justify-center overflow-hidden rounded-lg border px-1.5 text-left text-xs font-bold disabled:opacity-75 ${draggable ? "cursor-grab" : ""} ${overlap ? "border-amber-500" : "border-transparent"} ${appointment.source === "sanispa" ? "bg-emerald-100 text-emerald-950" : "bg-sanispa-blue text-white"}`}
                  style={{ top: 4 + 54 * lane, left: (begins - start) / hour * columnWidth, width: Math.max(2, (ends - begins) / hour * columnWidth - 2) }}
                  onClick={() => { setNewTechnician(null); setBooking(null); setSelected(appointment); }}
                  onDragStart={event => {
                    if (!draggable) { event.preventDefault(); return; }
                    const left = event.currentTarget.getBoundingClientRect().left;
                    beginDrag(event, { appointment, offset: (event.clientX - left) / columnWidth * hour });
                  }}
                  onDragEnd={finishDrag}>
                  <span className="block w-full truncate">{time}{status ? " · " + status : ""}</span>
                  <span className="block w-full truncate">{appointment.title}</span>
                </button>;
              })}
            </div>
          </div>;
        })}
      </div>
    </div>
    </div>
    </div>
    {appointments.some(appointment => appointment.source === "sanispa") ? <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sanispa-blue" /> Clients du partenaire</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> Dossiers SANISPA</span>
    </div> : null}
  </div>;
}
