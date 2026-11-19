"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clientRequest } from "@/lib/client-browser-api";
import { Button } from "./Button";
const topics = { eau: "Traitement d’eau", panne: "Comprendre une panne", entretien: "Entretenir mon spa", notices: "Trouver ma notice" };
type Message = { id: string; message: string; answer: string | null; state: string };
export function PremiumAssistant() {
  const params = useSearchParams();
  const initialTopic = params.get("topic") || "eau";
  const [topic, setTopic] = useState(initialTopic in topics ? initialTopic : "eau"), [threadId, setThreadId] = useState(""), [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(""), [error, setError] = useState(""), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const pending = useRef(false), requestId = useRef<string | null>(null);
  const readingId = topic === "eau" ? params.get("readingId") : null;
  const diagnosticId = params.get("diagnosticId");
  useEffect(() => {
    const controller = new AbortController(); setReady(false); setError(""); setMessages([]); requestId.current = null;
    clientRequest(`/api/client/assistant?topic=${topic}`, { signal: controller.signal }).then(r => { if (!controller.signal.aborted) { setThreadId(r.threadId || crypto.randomUUID()); setMessages(r.messages); setReady(true); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [topic]);
  async function send() {
    if (!text.trim() || pending.current || !ready) return;
    pending.current = true; setBusy(true); setError(""); requestId.current ??= crypto.randomUUID();
    const submittedId = requestId.current, submittedText = text.trim();
    try {
      const r = await clientRequest("/api/client/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, threadId, topic, message: text.trim(), ...(readingId ? { readingId } : {}), ...(diagnosticId ? { diagnosticId } : {}) }) });
      setMessages(current => [...current.filter(m => m.id !== submittedId), { id: submittedId, message: submittedText, answer: r.answer, state: "complete" }]); setText(""); requestId.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "Réponse indisponible."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="mt-6 grid gap-5"><div className="flex flex-wrap gap-2" role="group" aria-label="Sujet de l’assistance">{Object.entries(topics).map(([key, label]) => <button disabled={busy} key={key} aria-pressed={topic === key} className={`rounded-xl border p-3 font-bold ${topic === key ? "border-sanispa-blue bg-white" : "border-sanispa-line"}`} onClick={() => setTopic(key)}>{label}</button>)}</div>
    {readingId ? <p className="rounded-xl bg-emerald-50 p-4">Votre relevé sera transmis avec votre prochain message. <Link href="/premium/carnet#releves" className="underline">Revoir mes mesures</Link></p> : null}
    {diagnosticId ? <p className="rounded-xl bg-emerald-50 p-4">Les observations de votre dossier seront prises en compte.</p> : null}
    <p className="text-sm leading-6">Décrivez ce que vous observez. N’ouvrez pas de coffret électrique et n’effectuez aucun essai dangereux. Les notices et les étiquettes de vos produits restent les références pour votre équipement.</p>
    {error ? <p role="alert" className="rounded-xl bg-white p-4 text-red-800">{error} <Link href="/premium" className="font-bold underline">Mes services gratuits</Link> · <button className="underline" onClick={() => window.location.reload()}>Actualiser l’historique</button></p> : null}
    <div className="grid gap-4" aria-live="polite">{messages.map(m => <article className="grid gap-3" key={m.id}><p className="ml-5 whitespace-pre-wrap break-words rounded-2xl bg-sanispa-blue p-4 text-white">{m.message}</p>{m.answer ? <p className="mr-5 whitespace-pre-wrap break-words rounded-2xl border border-sanispa-line bg-white p-4 leading-7">{m.answer}</p> : <p className="text-sm">Réponse {m.state === "pending" ? "en cours" : "non confirmée"}.</p>}</article>)}</div>
    {ready ? <form className="grid gap-3 rounded-2xl border border-sanispa-line bg-white p-5" onSubmit={e => { e.preventDefault(); void send(); }}><label className="font-bold">Ma question<textarea className="mt-3 w-full rounded-xl border border-sanispa-line p-3 font-normal" required maxLength={3000} rows={4} value={text} disabled={busy} onChange={e => { setText(e.target.value); requestId.current = null; }} placeholder={readingId ? "Voici mon relevé. Quels éléments dois-je vérifier pour ajuster mon eau ?" : "Expliquez votre situation…"} /></label><Button type="submit" disabled={busy || !text.trim()}>{busy ? "L’assistant prépare sa réponse…" : "Envoyer ma question"}</Button></form> : null}
    <div className="flex flex-wrap gap-4 font-bold"><Link className="underline" href="/diagnostic?new=1">Déclarer une panne / demander un technicien</Link><Link className="underline" href="/premium/notices">Consulter les notices</Link></div>
  </div>;
}
