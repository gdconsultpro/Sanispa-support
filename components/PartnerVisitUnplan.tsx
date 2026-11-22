"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { partnerAuthError } from "@/lib/partner-browser";

export function PartnerVisitUnplan({ disabled, onUnplan }: { disabled?: boolean; onUnplan: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const text = useRef<HTMLParagraphElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmation) text.current?.focus(); }, [confirmation]);

  async function unplan() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onUnplan();
      setConfirmation(false);
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <>
    <button type="button" ref={button} hidden={confirmation} disabled={disabled} onClick={() => setConfirmation(true)}
      className="focus-ring min-h-11 text-left text-sm font-bold text-sanispa-blue underline">Déplanifier</button>
    {confirmation ? <div className="my-2 min-w-0 rounded-xl border border-sanispa-line bg-sanispa-ice p-3">
      <p ref={text} tabIndex={-1} className="text-sm font-bold">Retirer le créneau et remettre cette intervention dans « À planifier » ?</p>
      {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || disabled} onClick={() => void unplan()}>
          {busy ? "Déplanification…" : "Remettre à planifier"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => {
          setConfirmation(false);
          setError("");
          requestAnimationFrame(() => button.current?.focus());
        }}>Garder le créneau</Button>
      </div>
    </div> : null}
  </>;
}
