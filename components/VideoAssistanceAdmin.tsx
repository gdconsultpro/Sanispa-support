"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "./Button";
import { VideoSessionCard } from "./VideoAssistance";
import type { VideoSession } from "@/lib/video-assistance";
export function VideoAssistanceAdmin({ initialSessions }: { initialSessions: VideoSession[] }) {
  const [sessions, setSessions] = useState(initialSessions), [error, setError] = useState(""), [busy, setBusy] = useState("");
  async function manage(session: VideoSession, action: "schedule" | "complete" | "cancel", form?: HTMLFormElement) {
    if (busy) return; setBusy(session.id); setError("");
    try {
      const values = form ? new FormData(form) : null;
      const response = await fetch("/api/admin/visio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: session.id, version: session.version, action,
        ...(action === "schedule" ? { startsAt: new Date(String(values?.get("startsAt"))).toISOString(), meetingUrl: String(values?.get("meetingUrl")) } : {}) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Enregistrement impossible.");
      setSessions(current => current.map(item => item.id === session.id ? { ...body.session, dossierReference: item.dossierReference } : item));
    } catch (error) { setError(error instanceof Error ? error.message : "Enregistrement impossible."); }
    finally { setBusy(""); }
  }
  return <div className="mt-6 space-y-5">{error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : null}{!sessions.length ? <p className="rounded-2xl bg-white p-6">Aucune demande de visio pour le moment.</p> : null}
    {sessions.map(session => <section key={session.id} className="rounded-3xl border border-sanispa-line bg-white p-5"><p className="mb-3 text-sm font-bold text-sanispa-blue">{session.audience === "customer" ? "Particulier" : "Partenaire"} · {session.requesterEmail}{session.diagnosticId ? ` · Dossier ${session.dossierReference || "Référence en cours"}` : ""}</p>{session.diagnosticId ? <Link href={`/admin?q=${encodeURIComponent(session.diagnosticId)}`} className="focus-ring mb-4 inline-block rounded-lg py-2 text-sm font-bold text-sanispa-blue underline">Consulter le prédiagnostic et les photos →</Link> : null}<VideoSessionCard session={session} />
      {session.status === "requested" || session.status === "scheduled" ? <div className="mt-5"><form className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]" onSubmit={event => { event.preventDefault(); void manage(session, "schedule", event.currentTarget); }}>
        <label className="text-sm font-bold">Créneau · heure de votre navigateur<input name="startsAt" type="datetime-local" required className="focus-ring mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-sanispa-line p-3" /></label>
        <label className="text-sm font-bold">Lien Google Meet, Zoom, Teams ou Jitsi<input name="meetingUrl" type="url" required placeholder="https://meet.google.com/…" className="focus-ring mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-sanispa-line p-3" /></label>
        <Button type="submit" className="self-end" disabled={busy !== ""}>{busy === session.id ? "Enregistrement…" : session.status === "scheduled" ? "Modifier le rendez-vous" : "Confirmer le rendez-vous"}</Button>
      </form><p className="mt-3 text-xs leading-6 text-sanispa-steel">Créez le rendez-vous dans votre outil de visio, puis ajoutez son lien ici. Un e-mail informera le demandeur ; le lien sera aussi visible dans son espace.</p><div className="mt-4 flex flex-wrap gap-3">{session.status === "scheduled" ? <Button variant="secondary" disabled={busy !== ""} onClick={() => void manage(session, "complete")}>Marquer la visio terminée</Button> : null}<Button variant="ghost" disabled={busy !== ""} onClick={() => void manage(session, "cancel")}>Annuler la demande</Button></div></div> : null}
    </section>)}
  </div>;
}
