"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { partnerAuthError } from "@/lib/partner-browser";

export function PartnerVisitDelete({ disabled, onDelete }: {
  disabled?: boolean;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmation = useRef<HTMLParagraphElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);

  useEffect(() => { if (confirming) confirmation.current?.focus(); }, [confirming]);

  async function remove() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (cause) {
      setError(partnerAuthError(cause));
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  return <>
    <button hidden={confirming} type="button" ref={action} disabled={disabled} onClick={() => setConfirming(true)}
      className="focus-ring min-h-11 text-sm font-bold text-red-700 underline">Supprimer l’intervention</button>
    {confirming ? <div className="my-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <p ref={confirmation} tabIndex={-1} className="text-sm font-bold text-red-900">Supprimer cette intervention ? La fiche client restera dans votre carnet.</p>
      {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="text-red-800" disabled={busy || disabled}
          onClick={() => void remove()}>{busy ? "Suppression…" : "Confirmer la suppression"}</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => {
          setConfirming(false);
          setError("");
          requestAnimationFrame(() => action.current?.focus());
        }}>Garder l’intervention</Button>
      </div>
    </div> : null}
  </>;
}
