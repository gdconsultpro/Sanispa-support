"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import type { NextActionSnapshot } from "@/lib/admin-follow-up";

const stateLabels = { pending: "À réaliser", done: "Réalisée", cancelled: "Annulée" };

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function actionDate(value: string | null) {
  if (!value) return "Non renseignée";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(date)
    : "Date non disponible";
}

function isSnapshot(value: unknown): value is NextActionSnapshot {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  return (action.text === null || typeof action.text === "string") &&
    (action.dueAt === null || (typeof action.dueAt === "string" && Number.isFinite(new Date(action.dueAt).getTime()))) &&
    (action.state === null || action.state === "pending" || action.state === "done" || action.state === "cancelled") &&
    Number.isInteger(action.version) && Number(action.version) >= 0;
}

export function AdminNextAction({ diagnosticId, initialAction }: {
  diagnosticId: string;
  initialAction: NextActionSnapshot;
}) {
  const router = useRouter();
  const [savedAction, setSavedAction] = useState(initialAction);
  const [text, setText] = useState(initialAction.state === "pending" ? initialAction.text || "" : "");
  const [dueAt, setDueAt] = useState("");
  const [ready, setReady] = useState(false);
  const [timeZone, setTimeZone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const requestPending = useRef(false);
  const initialSnapshot = useRef(initialAction);
  const dirty = ready && (text !== (savedAction.state === "pending" ? savedAction.text || "" : "") ||
    dueAt !== (savedAction.state === "pending" ? localDateTime(savedAction.dueAt) : ""));
  const newerVersion = initialAction.version > savedAction.version;

  useEffect(() => {
    setDueAt(initialSnapshot.current.state === "pending" ? localDateTime(initialSnapshot.current.dueAt) : "");
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || busy || dirty || initialAction.version <= savedAction.version) return;
    setSavedAction(initialAction);
    setText(initialAction.state === "pending" ? initialAction.text || "" : "");
    setDueAt(initialAction.state === "pending" ? localDateTime(initialAction.dueAt) : "");
    setMessage("");
    setError("");
    setConflict(false);
  }, [initialAction, savedAction.version, ready, busy, dirty]);

  function useLatestAction() {
    setSavedAction(initialAction);
    setText(initialAction.state === "pending" ? initialAction.text || "" : "");
    setDueAt(initialAction.state === "pending" ? localDateTime(initialAction.dueAt) : "");
    setConflict(false);
    setError("");
    setMessage("");
  }

  async function submit(operation: "save" | "complete" | "cancel") {
    if (requestPending.current || !ready || newerVersion ||
      (operation !== "save" && (dirty || savedAction.state !== "pending"))) return;
    setMessage("");
    setError("");
    const trimmed = text.trim();
    const date = dueAt ? new Date(dueAt) : null;
    if (operation === "save" && (!trimmed || trimmed.length > 1000 || !date || !Number.isFinite(date.getTime()))) {
      setError("Renseignez l’action à réaliser (1 à 1 000 caractères) et une date avec une heure pour l’échéance.");
      return;
    }
    requestPending.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/diagnostics/${encodeURIComponent(diagnosticId)}/next-action`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, expectedVersion: savedAction.version,
          ...(operation === "save" ? { text: trimmed, dueAt: date!.toISOString() } : {}) })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(true);
          throw new Error("Cette action a été modifiée ailleurs. Votre saisie est conservée. Actualisez le dossier pour consulter la version enregistrée avant de réessayer.");
        }
        if (response.status === 401 || response.status === 403)
          throw new Error("Votre accès administrateur doit être vérifié. Reconnectez-vous avant de réessayer.");
        throw new Error(typeof payload?.error === "string" ? payload.error : "L’opération n’a pas pu être confirmée. Réessayez.");
      }
      if (!isSnapshot(payload?.action) || payload.action.version <= savedAction.version) {
        setConflict(true);
        throw new Error("La réponse ne permet pas de confirmer la modification. Actualisez le dossier pour vérifier son état avant de réessayer.");
      }
      const action = payload.action;
      setSavedAction(action);
      setText(action.state === "pending" ? action.text || "" : "");
      setDueAt(action.state === "pending" ? localDateTime(action.dueAt) : "");
      setConflict(false);
      setMessage(operation === "save" ? "L’action et son échéance sont enregistrées." : operation === "complete" ? "L’action est marquée comme réalisée." : "L’action est annulée.");
      router.refresh();
    } catch (cause) {
      const interrupted = !(cause instanceof Error) || cause instanceof TypeError;
      if (interrupted) setConflict(true);
      setError(interrupted ? "La connexion a été interrompue. Votre saisie est conservée ; actualisez le dossier pour vérifier son état avant de réessayer." : cause.message);
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  return <section className="mt-4 min-w-0 rounded-md border border-sanispa-line bg-sanispa-ice p-4" aria-labelledby={`next-action-${diagnosticId}`}>
    <h3 id={`next-action-${diagnosticId}`} className="font-bold text-sanispa-navy">Prochaine action</h3>
    {savedAction.state ? <div className="mt-3 rounded-md bg-white p-3 text-sm">
      <p className="font-bold text-sanispa-navy">{stateLabels[savedAction.state]}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sanispa-steel">{savedAction.text || "Action non renseignée"}</p>
      <p className="mt-2 text-sanispa-steel">Échéance : {actionDate(savedAction.dueAt)} (heure de Paris)</p>
    </div> : <p className="mt-2 text-sm text-sanispa-steel">Aucune action enregistrée pour ce dossier.</p>}
    <form className="mt-4 grid min-w-0 gap-3" onSubmit={event => { event.preventDefault(); void submit("save"); }}>
      <label className="block min-w-0 text-sm font-bold text-sanispa-navy">
        {savedAction.state === "done" || savedAction.state === "cancelled" ? "Nouvelle action à réaliser *" : "Action à réaliser *"}
        <textarea value={text} maxLength={1000} required disabled={busy || !ready} rows={3}
          onChange={event => { setText(event.target.value); setMessage(""); }}
          className="focus-ring mt-2 block w-full min-w-0 rounded-md border border-sanispa-line bg-white p-3 font-normal"
          placeholder="Exemple : rappeler le client pour préciser les symptômes" />
      </label>
      <label className="block min-w-0 text-sm font-bold text-sanispa-navy">Échéance : date et heure *
        <input type="datetime-local" required disabled={busy || !ready} value={dueAt}
          onChange={event => { setDueAt(event.target.value); setMessage(""); }}
          className="focus-ring mt-2 block w-full min-w-0 max-w-full rounded-md border border-sanispa-line bg-white p-3 font-normal" />
      </label>
      <p className="text-xs text-sanispa-steel">* Champs obligatoires. {timeZone ? `Saisie dans le fuseau de votre appareil : ${timeZone}.` : "Chargement du fuseau horaire…"}</p>
      {newerVersion ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
        <p>Une version plus récente de l’action est disponible. Votre saisie n’a pas été remplacée.</p>
        <button type="button" disabled={busy} onClick={useLatestAction} className="focus-ring mt-2 font-bold underline">Recharger l’action enregistrée et remplacer ma saisie</button>
      </div> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {conflict && !newerVersion ? <button type="button" disabled={busy} onClick={() => router.refresh()} className="focus-ring justify-self-start text-sm font-bold text-sanispa-blue underline">Actualiser le dossier sans effacer ma saisie</button> : null}
      {message ? <p className="rounded-md bg-green-50 p-3 text-sm text-green-700" role="status">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !ready || newerVersion}>{busy ? "Traitement…" : "Enregistrer l’action"}</Button>
        {savedAction.state === "pending" ? <>
          <Button type="button" variant="secondary" disabled={busy || !ready || dirty || newerVersion} onClick={() => void submit("complete")}>Marquer réalisée</Button>
          <Button type="button" variant="secondary" disabled={busy || !ready || dirty || newerVersion} onClick={() => void submit("cancel")}>Annuler l’action</Button>
        </> : null}
      </div>
      {dirty && savedAction.state === "pending" ? <p className="text-xs text-sanispa-steel">Enregistrez vos modifications avant de marquer l’action comme réalisée ou de l’annuler.</p> : null}
    </form>
  </section>;
}
