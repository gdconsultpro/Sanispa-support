"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { appointmentUnplanReasons, type AppointmentUnplanReason } from "@/lib/partner-unplanning";
import { partnerAuthError } from "@/lib/partner-browser";

type UnplanProps = { disabled?: boolean } & (
  { requireReason: true; onUnplan: (details: { reason: AppointmentUnplanReason; note: string }) => Promise<void> } |
  { requireReason?: false; onUnplan: () => Promise<void> }
);

export function PartnerVisitUnplan(props: UnplanProps) {
  const { disabled, requireReason } = props;
  const [reason, setReason] = useState<AppointmentUnplanReason | "">("");
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const text = useRef<HTMLParagraphElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmation) text.current?.focus(); }, [confirmation]);

  async function unplan() {
    if (submitting.current || (requireReason && !reason)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (props.requireReason && reason) await props.onUnplan({ reason, note });
      else if (!props.requireReason) await props.onUnplan();
      setConfirmation(false);
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <>
    <button type="button" ref={button} hidden={confirmation} disabled={disabled} onClick={() => setConfirmation(true)}
      className="focus-ring min-h-11 text-left text-sm font-bold text-sanispa-blue underline">Déplanifier</button>
    {confirmation ? <div className="my-2 min-w-0 rounded-xl border border-sanispa-line bg-sanispa-ice p-3">
      <p ref={text} tabIndex={-1} className="text-sm font-bold">Retirer le créneau et remettre cette intervention dans « À planifier » ?</p>
      {requireReason ? <div className="mt-2 grid gap-2">
        <label className="text-sm font-bold">Motif
          <select className="focus-ring mt-1 block min-h-11 w-full rounded-md border border-sanispa-line bg-white px-2 text-base font-normal" value={reason}
            onChange={event => setReason(event.target.value as AppointmentUnplanReason | "")} disabled={busy} required>
            <option value="">Choisir un motif</option>
            {Object.entries(appointmentUnplanReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold">Précision (facultative)
          <textarea className="focus-ring mt-1 block w-full rounded-md border border-sanispa-line bg-white p-2 text-base font-normal" value={note}
            onChange={event => setNote(event.target.value)} maxLength={300} rows={2} disabled={busy} />
        </label>
      </div> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || disabled || (requireReason && !reason)} onClick={() => void unplan()}>
          {busy ? "Déplanification…" : "Remettre à planifier"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => {
          setConfirmation(false);
          setError("");
          setReason("");
          setNote("");
          requestAnimationFrame(() => button.current?.focus());
        }}>Garder le créneau</Button>
      </div>
    </div> : null}
  </>;
}
