"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock3, Video } from "lucide-react";
import { Button } from "./Button";
import { clientRequest } from "@/lib/client-browser-api";
import { paymentsPaused } from "@/lib/commercial-mode";
import { partnerToken, redirectPartnerAccess } from "@/lib/partner-browser";
import type { VideoSession } from "@/lib/video-assistance";

const input = "focus-ring mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-sanispa-line bg-white p-3";
const labels = { requested: "À confirmer par SANISPA", scheduled: "Rendez-vous confirmé", completed: "Visio terminée", canceled: "Demande annulée" };
export function VideoSessionCard({ session }: { session: VideoSession }) {
  return <article className="rounded-2xl border border-sanispa-line bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Visio {session.audience === "partner" ? "partenaire" : "dépannage"} · {session.durationMinutes} minutes</h3><span className="rounded-full bg-sanispa-ice px-3 py-1 text-xs font-bold text-sanispa-blue">{labels[session.status]}</span></div>
    <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{session.details}</p>
    <p className="mt-3 text-sm text-sanispa-steel">Disponibilités souhaitées : {session.availability}</p>
    {session.startsAt ? <p className="mt-4 flex items-center gap-2 font-bold"><CalendarDays size={18} aria-hidden="true" />{new Date(session.startsAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" })} · heure de Paris</p> : <p className="mt-4 text-sm">SANISPA vous confirmera le créneau. Votre demande ne réserve pas encore un horaire.</p>}
    {session.complimentary ? <p className="mt-3 text-sm font-bold text-emerald-800">Visio gratuite · aucun règlement</p> : null}
    {session.meetingUrl ? <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer" className="focus-ring mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-sanispa-blue px-5 py-3 text-sm font-bold text-white"><Video size={18} aria-hidden="true" />Rejoindre ma visio</a> : null}
  </article>;
}

export function VideoAssistance({ audience, diagnosticId }: { audience: "customer" | "partner"; diagnosticId?: string }) {
  const [sessions, setSessions] = useState<VideoSession[]>([]), [diagnostics, setDiagnostics] = useState<{ id: string; problem_type: string }[]>([]);
  const [selected, setSelected] = useState(diagnosticId || ""), [details, setDetails] = useState(audience === "customer" ? "Je souhaite être guidé en visio à partir des réponses et photos de mon prédiagnostic." : ""), [availability, setAvailability] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const path = audience === "partner" ? "/partenaire/visio" : "/visio";
  const request = useCallback(async (endpoint: string, init: RequestInit = {}) => {
    if (audience === "customer") return clientRequest(endpoint, init);
    const token = await partnerToken(path); if (!token) throw new Error("Connectez-vous à votre espace partenaire.");
    const response = await fetch(endpoint, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (redirectPartnerAccess(response, path)) throw new Error("Reconnectez-vous à votre espace partenaire.");
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Chargement impossible."); return body;
  }, [audience, path]);
  const endpoint = `/api/${audience === "partner" ? "partner" : "client"}/visio`;
  const load = useCallback(async () => {
    try {
      const result = await request(endpoint); setSessions(result.sessions);
      if (audience === "customer") {
        const result = await request("/api/client/dashboard"); const items = result.diagnostics || []; setDiagnostics(items);
        setSelected(current => items.some((item: { id: string }) => item.id === current) ? current : items.length === 1 ? items[0].id : "");
      }
      setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Chargement impossible."); }
    finally { setLoading(false); }
  }, [audience, endpoint, request]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const result = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diagnosticId: selected || null, details, availability }) });
      setSessions(current => [result.session, ...current.filter(item => item.id !== result.session.id)]);
      setMessage("Votre demande de visio est enregistrée. SANISPA confirmera votre rendez-vous et le lien de connexion.");
    } catch (error) { setError(error instanceof Error ? error.message : "La demande n’a pas été enregistrée."); }
    finally { setBusy(false); }
  }
  return <div className="mt-7 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
    <section className="rounded-3xl border border-sanispa-line bg-white p-6 sm:p-8"><div className="flex items-center gap-3 text-sanispa-blue"><Video size={28} aria-hidden="true" /><span className="text-sm font-bold uppercase tracking-widest">Un technicien à vos côtés</span></div>
      <h2 className="mt-4 text-2xl font-bold">{audience === "customer" ? "Se faire accompagner à distance" : "Un appui pour votre dépannage"}</h2>
      <p className="mt-4 leading-7 text-sanispa-steel">{audience === "customer" ? "Après votre prédiagnostic, échangez en vidéo avec SANISPA pour préciser les symptômes et voir quelles vérifications accessibles sont possibles." : "Exposez votre difficulté à SANISPA et demandez une visio d’assistance technique. Précisez le modèle, les symptômes et ce que vous avez déjà constaté."}</p>
      <div className="my-5 flex flex-wrap items-center gap-3 rounded-2xl bg-sanispa-ice p-4"><Clock3 size={20} aria-hidden="true" /><strong>30 minutes</strong>{audience === "customer" && !paymentsPaused() ? <span>Tarif de référence : <strong>59 € TTC</strong>, TVA à 20 % incluse</span> : null}</div>
      {paymentsPaused() ? <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">La visio est actuellement gratuite. Aucune carte bancaire ni somme à régler.</p> : <p className="mb-5">La réservation payante sera proposée après confirmation de SANISPA.</p>}
      <p className="mb-5 text-sm leading-6 text-sanispa-steel">La visio apporte une aide, sans garantie de réparation. Ne démontez aucun équipement électrique et ne réalisez aucune manipulation dangereuse pour préparer l’appel.</p>
      <form onSubmit={event => void submit(event)} className="space-y-4">
        {audience === "customer" ? <label className="block text-sm font-bold">Mon prédiagnostic<select required value={selected} onChange={event => setSelected(event.target.value)} className={input}><option value="">Choisir ma demande</option>{diagnostics.map(item => <option key={item.id} value={item.id}>Dossier {item.id.slice(0, 8).toUpperCase()} · {item.problem_type}</option>)}</select></label> : null}
        <label className="block text-sm font-bold">Sur quoi souhaitez-vous être aidé ?<textarea required minLength={10} maxLength={1500} rows={4} value={details} onChange={event => setDetails(event.target.value)} className={input} /></label>
        <label className="block text-sm font-bold">Vos disponibilités<textarea required minLength={3} maxLength={500} rows={2} value={availability} onChange={event => setAvailability(event.target.value)} placeholder="Exemple : mardi ou jeudi, entre 14 h et 17 h" className={input} /></label>
        <Button type="submit" disabled={loading || busy || !paymentsPaused() || (audience === "customer" && !selected)}>{busy ? "Enregistrement…" : "Demander ma visio"}</Button>
        {audience === "customer" && !loading && !diagnostics.length ? <Link href="/diagnostic?new=1" className="block text-sm font-bold underline">Commencer mon prédiagnostic gratuit →</Link> : null}
      </form>
    </section>
    <section className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">Mes demandes de visio</h2><button onClick={() => void load()} className="focus-ring rounded-full px-3 py-2 text-sm font-bold text-sanispa-blue underline">Actualiser</button></div>
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} {audience === "customer" ? <Link href="/acces?next=visio" className="font-bold underline">Me connecter</Link> : null}</p> : null}
      {message ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p> : null}
      {loading ? <p role="status">Chargement de vos demandes…</p> : <div className="space-y-4">{sessions.map(session => <VideoSessionCard key={session.id} session={session} />)}{!sessions.length ? <p className="rounded-2xl border border-sanispa-line bg-white p-5 text-sm leading-7">Vos demandes et vos liens de rendez-vous apparaîtront ici.</p> : null}</div>}
    </section>
  </div>;
}
