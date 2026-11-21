"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Button } from "@/components/Button";
import {
  plannerDate, plannerDay, plannerTime, timelineDropTime, timelineQuarter, visitsOverlap,
  type PlannerAppointment, type PlannerSlot, type PlannerTechnician,
} from "@/lib/partner-planner";

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

export function PartnerScheduleGrid({ day, appointments, team, busy, onAdd, onMove, onCreate }: {
  day: string;
  appointments: PlannerAppointment[];
  team: PlannerTechnician[];
  busy: boolean;
  onAdd: (id: string, name: string) => Promise<boolean>;
  onMove: (appointment: PlannerAppointment, start: Date, technician: string | null) => Promise<boolean>;
  onCreate: (slot: PlannerSlot) => void;
}) {
  const [selected, setSelected] = useState<PlannerAppointment | null>(null);
  const [newTechnician, setNewTechnician] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const drag = useRef<{ appointment: PlannerAppointment; offset: number } | null>(null);
  const start = +plannerDay(day);
  const end = +plannerDay(day, 1);
  const elapsed = end - start;
  const length = elapsed / hour;
  const rows = [{ id: "", name: "À affecter" }, ...team];
  const firstVisit = appointments[0]?.starts_at;
  const firstVisible = firstVisit ? Math.max(start, Date.parse(firstVisit) - hour) : +new Date(day + "T08:00");
  const columnWidth = 96;

  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = (firstVisible - start) / hour * columnWidth;
  }, [firstVisible, start]);

  useEffect(() => { if (selected || newTechnician) heading.current?.focus(); }, [selected, newTechnician]);

  function finishDrag() {
    drag.current = null;
    setOver(null);
  }

  function drop(event: DragEvent<HTMLDivElement>, technician: string) {
    const current = drag.current;
    if (!current || busy) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const time = start + ((event.clientX - rect.left) / rect.width) * elapsed - current.offset;
    const duration = Date.parse(current.appointment.ends_at) - Date.parse(current.appointment.starts_at);
    const next = timelineDropTime(start, end, time, duration);
    finishDrag();
    void onMove(current.appointment, new Date(next), technician || null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    if (newTechnician) {
      const name = String(fields.get("name") ?? "").trim();
      if (name && await onAdd(newTechnician, name)) setNewTechnician(null);
    } else if (selected) {
      const date = new Date(`${fields.get("date")}T${fields.get("time")}`);
      if (await onMove(selected, date, String(fields.get("technician_id") || "") || null)) setSelected(null);
    }
  }

  return <div className="mb-5 min-w-0">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-bold">Grille par technicien</h3>
      <Button type="button" disabled={busy} variant="secondary" onClick={() => { setSelected(null); setNewTechnician(crypto.randomUUID()); }}>
        Ajouter un technicien
      </Button>
    </div>
    <p className="mb-3 text-sm text-sanispa-steel">Choisissez un créneau vide pour créer un rendez-vous. Touchez un rendez-vous pour le déplacer, ou glissez-le sur ordinateur.</p>
    {selected || newTechnician ? <section className="mb-3 rounded-xl bg-sanispa-ice p-4">
      <h4 ref={heading} tabIndex={-1} className="font-bold">{selected ? "Déplacer le rendez-vous" : "Ajouter un technicien au planning"}</h4>
      {selected ? <p className="mt-1 break-words text-sm">{selected.title} · {plannerTime(selected.starts_at)}–{plannerTime(selected.ends_at)}</p> : null}
      <form onSubmit={submit} key={selected?.source + ":" + selected?.id + ":" + newTechnician}>
        <fieldset disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-3">
          {selected ? <>
            <label className="min-w-0 text-sm font-bold">Nouvelle date
              <input name="date" type="date" required min="1900-01-01" max="2099-12-31" defaultValue={plannerDate(new Date(selected.starts_at))} className={inputClass + " mt-1"} />
            </label>
            <label className="min-w-0 text-sm font-bold">Nouvelle heure
              <input name="time" type="time" required defaultValue={plannerTime(selected.starts_at)} className={inputClass + " mt-1"} />
            </label>
            <PlannerTechnicianSelect team={team} selected={selected.technician_id} />
          </> : <label className="min-w-0 text-sm font-bold sm:col-span-2">Nom du technicien
            <input name="name" required maxLength={100} className={inputClass + " mt-1"} />
          </label>}
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button type="submit">{busy ? "Enregistrement…" : selected ? "Confirmer le déplacement" : "Enregistrer le technicien"}</Button>
            <Button type="button" variant="secondary" onClick={() => { setSelected(null); setNewTechnician(null); }}>Annuler</Button>
          </div>
        </fieldset>
      </form>
    </section> : null}
    <div ref={scroll} tabIndex={0} role="region" aria-label="Grille horaire des interventions" className="focus-ring isolate max-w-full overflow-x-auto rounded-xl border border-sanispa-line">
      <div className="w-max" role="table" aria-label="Rendez-vous de la journée par technicien">
        <div role="row" className="flex border-b border-sanispa-line bg-sanispa-ice text-sm">
          <div role="columnheader" className="sticky left-0 z-10 flex w-28 shrink-0 items-center border-r border-sanispa-line bg-sanispa-ice px-2 font-bold sm:w-44">Technicien</div>
          {Array.from({ length }, (_, index) => (
            <div role="columnheader" key={index} className="border-r border-sanispa-line px-2 py-2 font-semibold" style={{ width: columnWidth }}>
              {plannerTime(new Date(start + index * hour).toISOString())}
            </div>
          ))}
        </div>
        {rows.map(row => {
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
            return slots.every(slot => time < slot.begins || time >= slot.ends);
          }
          return <div role="row" key={row.id} className="flex border-b border-sanispa-line last:border-0">
            <div role="rowheader" className="sticky left-0 z-10 flex w-28 shrink-0 items-start break-words border-r border-sanispa-line bg-white px-2 py-3 text-sm font-bold sm:w-44">
              <span className="min-w-0">{row.name}</span>
            </div>
            <div role="cell" aria-colspan={length} aria-label={`Créneaux pour ${row.name}`} data-technician={row.id}
              className={`relative ${over === row.id ? "bg-sanispa-ice" : "bg-white"}`}
              style={{
                width: length * columnWidth, minHeight: Math.max(1, endByLane.length) * 54 + 8,
                backgroundImage: "linear-gradient(to right, transparent calc(100% - 1px), #d6e5f1 0)",
                backgroundSize: `${columnWidth}px 100%`,
              }}
              onDragOver={event => {
                if (!drag.current || busy) return;
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
                    : `Créer un rendez-vous à ${plannerTime(new Date(firstFree).toISOString())} · ${row.name}`;
                  return <button type="button" key={hourStart} aria-label={label} disabled={busy || firstFree === undefined}
                    className="focus-ring flex shrink-0 items-center justify-center text-lg font-bold text-transparent hover:bg-sanispa-ice hover:text-sanispa-blue focus-visible:bg-sanispa-ice focus-visible:text-sanispa-blue disabled:pointer-events-none"
                    style={{ width: columnWidth }}
                    title={label ? "Créer un rendez-vous" : undefined}
                    onClick={event => {
                      if (firstFree === undefined || drag.current) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const time = event.detail === 0 ? firstFree : timelineQuarter(hourStart, (event.clientX - rect.left) / rect.width);
                      if (!free(time)) return;
                      setNewTechnician(null);
                      setSelected(null);
                      onCreate({ startsAt: new Date(time).toISOString(), technicianId: row.id || null });
                    }}>
                    <span aria-hidden="true">+</span>
                  </button>;
                })}
              </div>
              {slots.map(({ appointment, begins, ends, lane }) => {
                const overlap = appointments.some(other => other !== appointment && other.technician_id === appointment.technician_id && visitsOverlap(appointment, other));
                const time = `${plannerTime(appointment.starts_at)}–${plannerTime(appointment.ends_at)}`;
                const draggable = appointment.movable && !busy && begins === Date.parse(appointment.starts_at);
                return <button type="button" key={appointment.source + appointment.id}
                  draggable={draggable} disabled={!appointment.movable || busy}
                  title={`${appointment.title} · ${time}${overlap ? " · Chevauchement" : ""}`}
                  aria-label={`${appointment.movable ? "Déplacer" : "Voir"} ${appointment.title}, ${time}${overlap ? ", chevauchement" : ""}`}
                  className={`focus-ring absolute z-[1] flex h-12 min-w-0 flex-col justify-center overflow-hidden rounded-lg border px-1.5 text-left text-xs font-bold disabled:opacity-75 ${draggable ? "cursor-grab" : ""} ${overlap ? "border-amber-500" : "border-transparent"} ${appointment.source === "sanispa" ? "bg-emerald-100 text-emerald-950" : "bg-sanispa-blue text-white"}`}
                  style={{ top: 4 + 54 * lane, left: (begins - start) / hour * columnWidth, width: Math.max(2, (ends - begins) / hour * columnWidth - 2) }}
                  onClick={() => { setNewTechnician(null); setSelected(appointment); }}
                  onDragStart={event => {
                    if (!draggable) { event.preventDefault(); return; }
                    const left = event.currentTarget.getBoundingClientRect().left;
                    drag.current = { appointment, offset: (event.clientX - left) / columnWidth * hour };
                    event.dataTransfer.setData("text/plain", appointment.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={finishDrag}>
                  <span className="block w-full truncate">{time}</span>
                  <span className="block w-full truncate">{appointment.title}</span>
                </button>;
              })}
            </div>
          </div>;
        })}
      </div>
    </div>
    {appointments.some(appointment => appointment.source === "sanispa") ? <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sanispa-blue" /> Clients du partenaire</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> Dossiers SANISPA</span>
    </div> : null}
  </div>;
}
