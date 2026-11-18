"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./Button";
import { ShopLinks } from "./ShopLinks";
import { clientRequest, localDateTime } from "@/lib/client-browser-api";
type Care = {
  spas: { id: string; brand: string; model: string }[];
  journal: { id: string; spa_id: string; kind: string; performed_at: string; note: string }[];
  reminders: { id: string; spa_id: string; title: string; due_at: string; repeat_days: number | null; version: number }[];
  readings: { id: string; spa_id: string; measured_at: string; ph: number | null; tac: number | null; temperature: number | null; disinfectant: string; disinfectant_value: number | null; product: string; note: string }[];
};
const input = "mt-2 w-full min-w-0 rounded-xl border border-sanispa-line bg-white p-3";
const careKinds = { vidange: "Vidange", filtre: "Filtre", consommables: "Consommables", observation: "Observation" };
export function CareDashboard() {
  const [data, setData] = useState<Care | null>(null), [spaId, setSpaId] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [date, setDate] = useState(""), [kind, setKind] = useState("observation"), [note, setNote] = useState("");
  const [reminderDate, setReminderDate] = useState(""), [reminderKind, setReminderKind] = useState("filtre"), [title, setTitle] = useState(""), [repeatDays, setRepeatDays] = useState("");
  const [readingDate, setReadingDate] = useState(""), [water, setWater] = useState({ volume: "", temperature: "", ph: "", tac: "", disinfectant: "inconnu", disinfectantValue: "", product: "", note: "" });
  const load = useCallback(async (signal?: AbortSignal) => { const r: Care = await clientRequest("/api/client/care", { signal }); if (!signal?.aborted) { setData(r); setSpaId(current => current || r.spas[0]?.id || ""); } }, []);
  useEffect(() => { const controller = new AbortController(); setDate(localDateTime()); setReadingDate(localDateTime()); void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [load]);
  async function save(payload: unknown) {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { await clientRequest("/api/client/care", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); setMessage("Votre carnet a été mis à jour."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }
  const reminders = data?.reminders.filter(r => r.spa_id === spaId) || [];
  const number = (s: string) => s.trim() ? Number(s.replace(",", ".")) : null;
  return <div className="mt-6 grid min-w-0 grid-cols-1 gap-5">
    {error ? <p role="alert" className="rounded-xl bg-white p-4 text-red-800">{error} <Link className="font-bold underline" href="/premium">Mon abonnement Premium</Link></p> : null}{message ? <p role="status" className="rounded-xl bg-emerald-50 p-4">{message}</p> : null}
    {!data && !error ? <p role="status">Chargement du carnet…</p> : null}
    {data && !data.spas.length ? <Link href="/espace-client" className="rounded-xl bg-white p-5 underline">Ajoutez votre spa dans votre espace client pour commencer votre carnet.</Link> : null}
    {data && data.spas.length ? <>
      <label className="font-bold">Le spa concerné<select className={input} value={spaId} onChange={e => setSpaId(e.target.value)}>{data.spas.map(s => <option key={s.id} value={s.id}>{s.brand} {s.model}</option>)}</select></label>
      <section className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Mes prochains rappels</h2><p className="mt-2 text-sm leading-6">Choisissez les dates et les fréquences adaptées à votre notice et à votre utilisation. Les rappels apparaissent ici et peuvent être envoyés par e-mail.</p>
        <div className="mt-4 grid gap-3">{reminders.map(r => <article className={`rounded-xl p-4 ${Date.parse(r.due_at) <= Date.now() ? "bg-amber-50" : "bg-sanispa-ice"}`} key={r.id}><h3 className="font-bold">{r.title}</h3><p>{new Date(r.due_at).toLocaleString("fr-FR")}{r.repeat_days ? ` · Tous les ${r.repeat_days} jours après réalisation` : ""}</p><div className="mt-3 flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void save({ action: "complete", id: r.id, version: r.version })}>C’est fait</Button><button disabled={busy} className="underline" onClick={() => void save({ action: "delete", type: "reminder", id: r.id })}>Supprimer ce rappel</button></div></article>)}</div>{!reminders.length ? <p className="mt-3">Aucun rappel pour ce spa.</p> : null}
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save({ action: "reminder", spaId, kind: reminderKind, title, date: new Date(reminderDate).toISOString(), repeatDays: repeatDays ? Number(repeatDays) : null }); }}>
          <label>Type de rappel<select className={input} value={reminderKind} onChange={e => setReminderKind(e.target.value)}>{Object.entries(careKinds).filter(([k]) => k !== "observation").map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>À prévoir<input className={input} required minLength={3} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. nettoyer les filtres" /></label>
          <label>Date du rappel<input className={input} type="datetime-local" required value={reminderDate} onChange={e => setReminderDate(e.target.value)} /></label>
          <label>Répéter après réalisation (jours, facultatif)<input className={input} type="number" min={1} max={3650} value={repeatDays} onChange={e => setRepeatDays(e.target.value)} /></label>
          <Button disabled={busy} type="submit">Ajouter mon rappel</Button>
        </form><div className="mt-5"><ShopLinks problemType="traitement-eau" /></div>
      </section>
      <section className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Mon journal de bord</h2><form className="mt-4 grid gap-4" onSubmit={e => { e.preventDefault(); void save({ action: "journal", spaId, kind, date: new Date(date).toISOString(), note }); }}>
        <label>Ce que j’ai fait ou observé<select className={input} value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(careKinds).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Date de l’entretien ou de l’observation<input className={input} type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Mes notes<textarea className={input} required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><Button disabled={busy} type="submit">Ajouter à mon journal</Button>
      </form><ol className="mt-5 grid gap-3">{data.journal.filter(j => j.spa_id === spaId).map(j => <li key={j.id} className="rounded-xl bg-sanispa-ice p-4"><p className="font-bold">{careKinds[j.kind as keyof typeof careKinds]} · {new Date(j.performed_at).toLocaleString("fr-FR")}</p><p className="mt-2 whitespace-pre-wrap break-words">{j.note}</p><button disabled={busy} className="mt-2 text-sm underline" onClick={() => void save({ action: "delete", type: "journal", id: j.id })}>Supprimer cette entrée</button></li>)}</ol></section>
      <section id="releves" className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Mes relevés d’eau</h2><p className="mt-2 text-sm">Une case vide signifie « non mesuré ». Reportez les valeurs de votre test avec leurs unités ; le relevé peut être transmis à votre assistant.</p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save({ action: "reading", spaId, date: new Date(readingDate).toISOString(), ...water, volume: number(water.volume), temperature: number(water.temperature), ph: number(water.ph), tac: number(water.tac), disinfectantValue: number(water.disinfectantValue) }); }}>
          <label>Date de la mesure<input className={input} type="datetime-local" required value={readingDate} onChange={e => setReadingDate(e.target.value)} /></label>
          {([{ key: "volume", label: "Volume du spa (litres)", max: 100000 }, { key: "temperature", label: "Température (°C)", max: 60 }, { key: "ph", label: "pH", max: 14 }, { key: "tac", label: "TAC (mg/L)", max: 1000 }, { key: "disinfectantValue", label: "Désinfectant mesuré (mg/L)", max: 100 }] as const).map(f => <label key={f.key}>{f.label}<input className={input} type="number" step="any" min={f.key === "volume" ? 1 : 0} max={f.max} value={water[f.key]} onChange={e => setWater(current => ({ ...current, [f.key]: e.target.value }))} /></label>)}
          <label>Désinfectant principal<select className={input} value={water.disinfectant} onChange={e => setWater(current => ({ ...current, disinfectant: e.target.value }))}>{["inconnu", "chlore", "brome", "autre", "aucun"].map(v => <option value={v} key={v}>{v}</option>)}</select></label>
          <label>Produit exact et concentration, si connus<input className={input} maxLength={300} value={water.product} onChange={e => setWater(current => ({ ...current, product: e.target.value }))} /></label>
          <label>Observations sur l’eau<textarea className={input} maxLength={2000} value={water.note} onChange={e => setWater(current => ({ ...current, note: e.target.value }))} /></label><Button disabled={busy} type="submit">Enregistrer mon relevé</Button>
        </form>
        <div className="mt-5 max-w-full overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><caption className="mb-3 text-left font-bold">Historique de mes mesures</caption><thead><tr>{["Date", "pH", "TAC mg/L", "°C", "Désinfectant mg/L", "Suite"].map(c => <th className="p-2" key={c}>{c}</th>)}</tr></thead><tbody>{data.readings.filter(r => r.spa_id === spaId).map(r => <tr key={r.id} className="border-t border-sanispa-line"><td className="p-2">{new Date(r.measured_at).toLocaleString("fr-FR")}</td><td className="p-2">{r.ph ?? "—"}</td><td className="p-2">{r.tac ?? "—"}</td><td className="p-2">{r.temperature ?? "—"}</td><td className="p-2">{r.disinfectant} : {r.disinfectant_value ?? "—"}</td><td className="p-2"><Link className="font-bold underline" href={`/premium/assistant?topic=eau&readingId=${r.id}`}>Envoyer à l’IA</Link><button disabled={busy} className="mt-2 block underline" onClick={() => void save({ action: "delete", type: "reading", id: r.id })}>Supprimer</button></td></tr>)}</tbody></table></div>
      </section>
    </> : null}
  </div>;
}
