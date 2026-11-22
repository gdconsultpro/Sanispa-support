"use client";
import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AdminActions({ diagnosticId, archived = false, intervention = false, onDone }: {
  diagnosticId: string;
  archived?: boolean;
  intervention?: boolean;
  onDone?: (message: string) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const pending = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const explanation = useRef<HTMLParagraphElement>(null);
  const item = intervention ? "l’intervention" : "le dossier";
  const buttonClass = "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold disabled:opacity-50";
  const secondary = buttonClass + " border-sanispa-line bg-white text-sanispa-navy";
  const danger = buttonClass + " border-red-200 bg-white text-red-800";

  useEffect(() => { if (confirming) explanation.current?.focus(); }, [confirming]);

  async function archive() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/diagnostics/${diagnosticId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "La mise à jour du dossier a échoué. Réessayez.");
      }
      const message = archived ? "Le dossier a été restauré dans les demandes actives."
        : intervention ? "L’intervention a été déplacée dans les archives." : "Le dossier a été déplacé dans les archives.";
      setDone(message);
      setConfirming(false);
      onDone?.(message);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "La mise à jour du dossier a échoué. Réessayez.");
    } finally {
      setLoading(false);
      pending.current = false;
    }
  }

  if (done) return <p role="status" className="text-sm font-semibold text-emerald-800">{done}</p>;
  return <div className="min-w-0">
    <button hidden={confirming} ref={trigger} type="button" disabled={loading}
      className={archived ? secondary : danger} onClick={() => {
        if (archived) void archive();
        else { setError(""); setConfirming(true); }
      }}>
      {archived ? <RotateCcw size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
      {archived ? loading ? "Restauration…" : "Restaurer le dossier" : "Supprimer " + item}
    </button>
    {confirming ? <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p ref={explanation} tabIndex={-1} className="text-sm text-red-900">
        {intervention ? "Supprimer cette intervention ?" : "Supprimer ce dossier ?"}{" "}
        La restauration sera possible dans <strong>Demandes → Archivées</strong>.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={danger} disabled={loading} onClick={() => void archive()}>{loading ? "Suppression…" : "Confirmer la suppression"}</button>
        <button type="button" className={secondary} disabled={loading} onClick={() => {
          setConfirming(false);
          setError("");
          requestAnimationFrame(() => trigger.current?.focus());
        }}>Annuler</button>
      </div>
    </div> : null}
    {error ? <p role="alert" className="mt-2 text-sm font-semibold text-red-800">{error}</p> : null}
  </div>;
}
