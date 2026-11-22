"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { partnerAuthError } from "@/lib/partner-browser";
import { plannerRequest } from "@/lib/partner-planner-browser";
import {
  defaultInterventionDurations, defaultTechnicianHours, parisDateTime, planningLocalParts, planningResourcesPath,
  planningTypeKey, type PlanningResources, type TechnicianAvailability, type WeeklyHours,
} from "@/lib/partner-availability";

const input = "focus-ring min-h-11 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-2.5 py-2 text-base";
const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const parisDateLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
const standardTypes = new Set(defaultInterventionDurations.map(item => planningTypeKey(item.label)));

export function PartnerPlanningResources({ resources, error, onChange }: { resources: PlanningResources | null; error: string; onChange: () => void }) {
  const [member, setMember] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const technician = resources?.team.find(item => item.id === member) ?? resources?.team[0];

  async function save(payload: object, reset?: HTMLFormElement) {
    setBusy(true);
    setResult(null);
    try {
      if (!await plannerRequest(planningResourcesPath, { payload })) return;
      reset?.reset();
      setResult({ message: "Réglage enregistré." });
      onChange();
    } catch (cause) { setResult({ message: partnerAuthError(cause), error: true }); }
    finally { setBusy(false); }
  }

  function saveDuration(event: FormEvent<HTMLFormElement>, label?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save({ action: "saveDuration", label: label ?? form.get("label"), duration_minutes: Number(form.get("duration")) }, label ? undefined : event.currentTarget);
  }

  return <details className="my-4 min-w-0 rounded-xl border border-sanispa-line bg-sanispa-ice p-3 sm:p-4">
    <summary className="focus-ring cursor-pointer font-bold">Durées, horaires et absences</summary>
    {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
    {!resources && !error ? <p role="status" className="mt-3 text-sm">Chargement des réglages du planning…</p> : null}
    {resources ? <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-2">
      <section className="min-w-0 rounded-xl bg-white p-3 sm:p-4">
        <h3 className="font-bold">Types d’intervention</h3>
        <p className="mt-1 text-sm text-sanispa-steel">La durée prévue est reprise dans le planning et peut être ajustée pour chaque rendez-vous.</p>
        <ul className="divide-y divide-sanispa-line">
          {resources.durations.map(item => {
            const key = planningTypeKey(item.label);
            const custom = resources.customizedTypes.includes(key);
            return <li key={key} className="py-2">
              {resources.canManage ? <form onSubmit={event => saveDuration(event, item.label)}>
                <fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-sm font-bold">{item.label}
                    <input type="number" name="duration" min={1} max={720} required key={item.duration_minutes} defaultValue={item.duration_minutes} className={input + " mt-1"} />
                    <span className="sr-only">Durée en minutes</span>
                  </label>
                  <Button type="submit" variant="secondary" aria-label={`Enregistrer la durée pour ${item.label}`}>Enregistrer</Button>
                  {custom ? <button type="button" className="focus-ring min-h-11 text-sm font-bold underline"
                    onClick={() => void save({ action: "removeDuration", label: item.label })}>
                    {standardTypes.has(key) ? "Rétablir la durée" : "Retirer du catalogue"}
                  </button> : null}
                </fieldset>
              </form> : <p className="text-sm">{item.label} · {item.duration_minutes} min</p>}
            </li>;
          })}
        </ul>
        {resources.canManage ? <form onSubmit={event => saveDuration(event)} className="mt-3 border-t border-sanispa-line pt-3">
          <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <label className="text-sm font-bold">Nouveau type
              <input name="label" className={input + " mt-1"} maxLength={140} required />
            </label>
            <label className="text-sm font-bold">Durée (min)
              <input name="duration" type="number" min={1} max={720} defaultValue={60} className={input + " mt-1"} required />
            </label>
            <div className="sm:col-span-2"><Button type="submit">Ajouter le type</Button></div>
          </fieldset>
        </form> : null}
      </section>
      <section className="min-w-0 rounded-xl bg-white p-3 sm:p-4">
        <h3 className="font-bold">Disponibilités de l’équipe</h3>
        {technician ? <>
          <label className="mt-3 block text-sm font-bold">Technicien à consulter
            <select className={input + " mt-1"} value={technician.id} disabled={busy} onChange={event => setMember(event.target.value)}>
              {resources.team.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <TechnicianHours key={technician.id} technician={technician} busy={busy} canManage={resources.canManage}
            save={hours => save({ action: "saveHours", technician_id: technician.id, hours })} />
          <div className="mt-4 border-t border-sanispa-line pt-3">
            <h4 className="font-bold">Absences à venir</h4>
            {technician.absences.length ? <ul className="my-2 space-y-2">
              {technician.absences.map(absence => <li key={absence.id} className="flex flex-wrap justify-between gap-x-2 rounded-lg bg-sanispa-ice p-2 text-sm">
                <span>{absence.label ? <strong className="block break-words">{absence.label}</strong> : null}
                  {parisDateLabel.formatRange(new Date(absence.starts_at), new Date(absence.ends_at))}</span>
                {resources.canManage ? <button type="button" disabled={busy} className="focus-ring min-h-11 font-bold underline"
                  onClick={() => void save({ action: "removeAbsence", technician_id: technician.id, id: absence.id })}>Retirer l’absence</button> : null}
              </li>)}
            </ul> : <p className="mt-1 text-sm">Aucune absence enregistrée.</p>}
            {resources.canManage ? <form className="mt-2" onSubmit={event => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              try {
                const starts_at = parisDateTime(String(fields.get("from")));
                const ends_at = parisDateTime(String(fields.get("to")));
                void save({ action: "saveAbsence", technician_id: technician.id, id: crypto.randomUUID(), starts_at, ends_at, label: fields.get("reason") }, event.currentTarget);
              } catch (cause) { setResult({ error: true, message: partnerAuthError(cause) }); }
            }}>
              <fieldset disabled={busy} className="grid min-w-0 gap-2 sm:grid-cols-2">
                <label className="min-w-0 text-sm font-bold">Début de l’absence
                  <input name="from" type="datetime-local" required defaultValue={planningLocalParts(new Date().toISOString()).day + "T08:00"} className={input + " mt-1"} />
                </label>
                <label className="min-w-0 text-sm font-bold">Fin de l’absence
                  <input name="to" type="datetime-local" required className={input + " mt-1"} />
                </label>
                <label className="text-sm font-bold sm:col-span-2">Libellé (facultatif)
                  <input name="reason" maxLength={100} className={input + " mt-1"} />
                </label>
                <div className="sm:col-span-2"><Button type="submit" variant="secondary">Ajouter l’absence</Button></div>
              </fieldset>
            </form> : null}
          </div>
          <p className="mt-3 text-sm text-sanispa-steel">Heure de Paris. Les rendez-vous déjà enregistrés restent au planning après un changement de disponibilité.</p>
        </> : <p className="mt-2 text-sm">Ajoutez un technicien depuis la grille du planning pour renseigner ses disponibilités.</p>}
      </section>
    </div> : null}
    {result ? <p role={result.error ? "alert" : "status"} className={"mt-3 text-sm font-bold " + (result.error ? "text-red-800" : "text-emerald-800")}>{result.message}</p> : null}
  </details>;
}

function TechnicianHours({ technician, busy, canManage, save }: {
  technician: TechnicianAvailability; busy: boolean; canManage: boolean; save: (hours: WeeklyHours[]) => Promise<void>;
}) {
  const hours = technician.hours ?? defaultTechnicianHours;
  const [secondShift, setSecondShift] = useState(() => days.map((_, index) => hours.filter(item => item.weekday === index + 1).length > 1));
  return <form className="mt-3" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const hours = days.flatMap((_, index) => [0, 1].flatMap(shift => {
      const start = String(fields.get(`start-${index}-${shift}`) || "");
      const end = String(fields.get(`end-${index}-${shift}`) || "");
      return start || end ? [{ weekday: index + 1, start, end }] : [];
    }));
    void save(hours);
  }}>
    <fieldset disabled={busy || !canManage} className="min-w-0">
      <legend className="font-bold">Horaires hebdomadaires</legend>
      <p className="my-1 text-sm text-sanispa-steel">{technician.hours === null ? "Par défaut, les créneaux proposés couvrent le lundi au vendredi de 8 h à 18 h. Enregistrez les horaires réels pour les appliquer aux réservations." : "Laissez les deux heures vides pour un jour non travaillé."}</p>
      {days.map((day, index) => {
        const shifts = hours.filter(item => item.weekday === index + 1);
        return <fieldset key={day} className="my-2 min-w-0 rounded-lg border border-sanispa-line p-2">
          <legend className="px-1 text-sm font-bold">{day}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].filter(shift => shift === 0 || secondShift[index]).map(shift => <div key={shift} className="col-span-2 grid grid-cols-2 gap-2">
              <label className="min-w-0 text-sm">{shift ? "Reprise" : "Début"}
                <input type="time" name={`start-${index}-${shift}`} aria-label={`${day} ${shift ? "reprise" : "début"}`} defaultValue={shifts[shift]?.start} className={input} />
              </label>
              <label className="min-w-0 text-sm">{shift ? "Fin de journée" : "Fin"}
                <input type="time" name={`end-${index}-${shift}`} aria-label={`${day} ${shift ? "fin de journée" : "fin"}`} defaultValue={shifts[shift]?.end} className={input} />
              </label>
            </div>)}
          </div>
          {canManage ? <button type="button" className="focus-ring mt-1 min-h-11 text-sm font-bold underline"
            onClick={() => setSecondShift(flags => flags.map((flag, i) => i === index ? !flag : flag))}>
            {secondShift[index] ? "Retirer la seconde plage" : "Ajouter une seconde plage"}
          </button> : null}
        </fieldset>;
      })}
      {canManage ? <Button type="submit">Enregistrer les horaires</Button> : null}
    </fieldset>
  </form>;
}
