"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { partnerAuthError } from "@/lib/partner-browser";
import { planningResourcesPath, type AvailableSlot } from "@/lib/partner-availability";
import { plannerDate, plannerTime } from "@/lib/partner-planner";
import { plannerRequest } from "@/lib/partner-planner-browser";

const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
type SlotSearch = { day: string; duration: number; technician?: string; after?: string };

export function fillPlannerSlot(form: HTMLFormElement | null, slot: AvailableSlot, names = { day: "date", time: "start", technician: "technician_id" }) {
  if (!form) return;
  const day = form.elements.namedItem(names.day);
  const time = form.elements.namedItem(names.time);
  const technician = form.elements.namedItem(names.technician);
  if (day instanceof HTMLInputElement) day.value = plannerDate(new Date(slot.starts_at));
  if (time instanceof HTMLInputElement) time.value = plannerTime(slot.starts_at);
  if (technician instanceof HTMLSelectElement) technician.value = slot.technician_id;
}

export function PartnerSlotSuggestions({ search, select }: { search: () => SlotSearch | null; select: (slot: AvailableSlot) => void }) {
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function suggest() {
    const values = search();
    if (pending.current) return;
    setSlots(null);
    setError("");
    if (!values || !values.day || !Number.isInteger(values.duration) || values.duration < 1 || values.duration > 720) {
      setError("Choisissez une date de départ et une durée de 1 à 720 minutes.");
      return;
    }
    pending.current = true;
    setBusy(true);
    const query = new URLSearchParams({ day: values.day, duration: String(values.duration) });
    if (values.technician) query.set("technician", values.technician);
    if (values.after) query.set("after", values.after);
    try {
      const result = await plannerRequest(planningResourcesPath + "?" + query);
      if (result) setSlots(result.slots);
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  return <div className="min-w-0 rounded-lg border border-sanispa-line bg-white p-3">
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void suggest()}>
      {busy ? "Recherche en cours…" : "Proposer des créneaux"}
    </Button>
    {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
    {slots && slots.length === 0 ? <p role="status" className="mt-2 text-sm">Aucun créneau sur les 14 jours recherchés. Vérifiez les techniciens, la date ou la durée.</p> : null}
    {slots?.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {slots.map(slot => <li key={slot.technician_id + slot.starts_at}>
        <button type="button" className="focus-ring min-h-11 w-full break-words rounded-lg border border-sanispa-line px-3 py-2 text-left text-sm hover:bg-sanispa-ice"
          onClick={() => { select(slot); setSlots(null); }}>
          <span className="block font-bold text-sanispa-blue">{dayLabel.format(new Date(slot.starts_at))} · {plannerTime(slot.starts_at)}–{plannerTime(slot.ends_at)}</span>
          {slot.technician_name}
        </button>
      </li>)}
    </ul> : null}
  </div>;
}
