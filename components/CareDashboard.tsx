"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { ShopLinks } from "./ShopLinks";
import { clientRequest, localDateTime } from "@/lib/client-browser-api";
type Reminder = {
  id: string;
  spa_id: string;
  title: string;
  due_at: string;
  repeat_days: number | null;
  repeat_months: number | null;
  repeat_years: number | null;
  version: number;
};
type Care = {
  spas: { id: string; brand: string; model: string }[];
  journal: { id: string; spa_id: string; kind: string; performed_at: string; note: string }[];
  reminders: Reminder[];
  readings: { id: string; spa_id: string; measured_at: string; volume_litres: number | null; ph: number | null; tac: number | null; temperature: number | null; disinfectant: string; disinfectant_value: number | null; product: string; note: string }[];
};
const input = "mt-2 w-full min-w-0 rounded-xl border border-sanispa-line bg-white p-3";
const careKinds = { vidange: "Vidange", filtre: "Filtre", consommables: "Consommables", observation: "Observation" };
const reminderLimits = { days: 3650, months: 120, years: 10 };
type ReminderSchedule = { date: string; unit: "once" | keyof typeof reminderLimits; count: string };
const emptySchedule: ReminderSchedule = { date: "", unit: "once", count: "1" };

function scheduleFor(reminder: Reminder): ReminderSchedule {
  const date = localDateTime(new Date(reminder.due_at));
  if (reminder.repeat_days) return { date, unit: "days", count: String(reminder.repeat_days) };
  if (reminder.repeat_months) return { date, unit: "months", count: String(reminder.repeat_months) };
  if (reminder.repeat_years) return { date, unit: "years", count: String(reminder.repeat_years) };
  return { ...emptySchedule, date };
}

function schedulePayload(schedule: ReminderSchedule, reminder?: Reminder) {
  const count = Number(schedule.count);
  return {
    date: reminder && schedule.date === localDateTime(new Date(reminder.due_at))
      ? reminder.due_at
      : new Date(schedule.date).toISOString(),
    repeatDays: schedule.unit === "days" ? count : null,
    repeatMonths: schedule.unit === "months" ? count : null,
    repeatYears: schedule.unit === "years" ? count : null,
  };
}

function ScheduleFields({ schedule, onChange, dateInput }: {
  schedule: ReminderSchedule;
  onChange: (schedule: ReminderSchedule) => void;
  dateInput?: React.Ref<HTMLInputElement>;
}) {
  return (
    <>
      <label>Date du rappel
        <input ref={dateInput} className={input} type="datetime-local" required value={schedule.date}
          onChange={event => onChange({ ...schedule, date: event.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Répéter après réalisation
          <select className={input} value={schedule.unit} onChange={event => onChange({
            ...schedule, unit: event.target.value as ReminderSchedule["unit"], count: "1",
          })}>
            <option value="once">Une seule fois</option>
            <option value="days">En jours</option>
            <option value="months">En mois</option>
            <option value="years">En années</option>
          </select>
        </label>
        {schedule.unit !== "once" ? (
          <label>Nombre {schedule.unit === "days" ? "de jours" : schedule.unit === "months" ? "de mois" : "d’années"}
            <input className={input} type="number" required min={1} max={reminderLimits[schedule.unit]}
              value={schedule.count} onChange={event => onChange({ ...schedule, count: event.target.value })} />
          </label>
        ) : null}
      </div>
    </>
  );
}

function reminderFrequency(reminder: Reminder) {
  if (reminder.repeat_days)
    return reminder.repeat_days === 1 ? "Chaque jour" : `Tous les ${reminder.repeat_days} jours`;
  if (reminder.repeat_months)
    return reminder.repeat_months === 1 ? "Chaque mois" : `Tous les ${reminder.repeat_months} mois`;
  if (reminder.repeat_years)
    return reminder.repeat_years === 1 ? "Chaque année" : `Tous les ${reminder.repeat_years} ans`;
  return "Une fois";
}
export function CareDashboard({ view = "carnet" }: { view?: "carnet" | "releves" }) {
  const [data, setData] = useState<Care | null>(null), [spaId, setSpaId] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [date, setDate] = useState(""), [kind, setKind] = useState("observation"), [note, setNote] = useState("");
  const [reminderKind, setReminderKind] = useState("filtre"), [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState(emptySchedule);
  const [editing, setEditing] = useState<{ reminder: Reminder; schedule: ReminderSchedule } | null>(null);
  const editDate = useRef<HTMLInputElement>(null);
  const editingId = editing?.reminder.id;
  useEffect(() => { if (editingId) editDate.current?.focus(); }, [editingId]);
  const [readingDate, setReadingDate] = useState(""), [water, setWater] = useState({ volume: "", temperature: "", ph: "", tac: "", disinfectant: "inconnu", disinfectantValue: "", product: "", note: "" });
  const [brand, setBrand] = useState(""), [model, setModel] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => { const r: Care = await clientRequest("/api/client/care", { signal }); if (!signal?.aborted) { setData(r); setSpaId(current => current || r.spas[0]?.id || ""); } }, []);
  useEffect(() => { const controller = new AbortController(); setDate(localDateTime()); setReadingDate(localDateTime()); void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [load]);
  async function save(payload: unknown, afterSave?: () => void) {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      await clientRequest("/api/client/care", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      afterSave?.();
      setMessage("Votre carnet a été mis à jour.");
      await load();
    }
    catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }
  async function addSpa(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const result = await clientRequest("/api/client/spas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.trim() || "Marque inconnue", model: model.trim() }) });
      setSpaId(result.spa.id); await load(); setMessage("Votre spa est ajouté. Vous pouvez remplir vos tableaux.");
    } catch (e) { setError(e instanceof Error ? e.message : "Ajout impossible."); }
    finally { setBusy(false); }
  }
  const reminders = data?.reminders.filter(r => r.spa_id === spaId) || [];
  function addReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save({
      action: "reminder",
      spaId,
      kind: reminderKind,
      title,
      ...schedulePayload(schedule),
    });
  }
  function editReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const { reminder, schedule } = editing;
    void save({
      action: "edit-reminder",
      id: reminder.id,
      version: reminder.version,
      ...schedulePayload(schedule, reminder),
    }, () => setEditing(null));
  }
  const number = (s: string) => s.trim() ? Number(s.replace(",", ".")) : null;
  return <div className="mt-6 grid min-w-0 grid-cols-1 gap-5">
    <nav aria-label="Suivi de mon spa" className="flex flex-wrap gap-3">{[["carnet", "Mon carnet et mes rappels"], ["releves", "Mes relevés d’eau"]].map(([key,label]) => <Link key={key} href={`/premium/${key}`} aria-current={view === key ? "page" : undefined} className={`focus-ring rounded-full border px-5 py-3 font-bold ${view === key ? "bg-sanispa-blue text-white" : "bg-white"}`}>{label}</Link>)}</nav>
    {error ? <p role="alert" className="rounded-xl bg-white p-4 text-red-800">{error} <Link className="font-bold underline" href={`/connexion?next=${view}`}>Me connecter à mon compte</Link></p> : null}{message ? <p role="status" className="rounded-xl bg-emerald-50 p-4">{message}</p> : null}
    {!data && !error ? <p role="status">Chargement du carnet…</p> : null}
    {data && !data.spas.length ? <section className="rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Mon premier spa</h2><p className="mt-2">Ajoutez votre spa ici pour enregistrer vos entretiens, rappels et mesures. La marque et le modèle peuvent rester inconnus.</p><form onSubmit={addSpa} className="mt-4 grid gap-4 sm:grid-cols-2"><label>Marque du spa<input className={input} maxLength={150} value={brand} onChange={e => setBrand(e.target.value)} placeholder="Ex. Jacuzzi, ou laisser vide" /></label><label>Modèle, si connu<input className={input} maxLength={150} value={model} onChange={e => setModel(e.target.value)} /></label><Button type="submit" disabled={busy}>Ajouter mon spa et commencer</Button></form></section> : null}
    {data ? <>
      {data.spas.length ? <label className="font-bold">Le spa concerné<select className={input} value={spaId} onChange={e => { setEditing(null); setSpaId(e.target.value); }}>{data.spas.map(s => <option key={s.id} value={s.id}>{s.brand} {s.model}</option>)}</select></label> : null}
      <fieldset disabled={busy || !spaId} className="grid min-w-0 grid-cols-1 gap-5">
      {!spaId ? <p className="rounded-xl bg-sanispa-ice p-4 text-sm">Vos tableaux sont prêts. Ajoutez votre spa ci-dessus pour saisir votre première information.</p> : null}
      {view === "carnet" ? <>
      <section className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Mes prochains rappels</h2><p className="mt-2 text-sm leading-6">Choisissez les dates et les fréquences adaptées à votre notice et à votre utilisation. Les rappels apparaissent ici et peuvent être envoyés par e-mail.</p>
        {editing ? (
          <form onSubmit={editReminder} aria-labelledby="edit-reminder-title" className="mt-4 grid gap-4 rounded-xl border border-sanispa-line bg-sanispa-ice p-4 sm:grid-cols-2">
            <h3 id="edit-reminder-title" className="font-bold sm:col-span-2">Modifier le rappel « {editing.reminder.title} »</h3>
            <ScheduleFields schedule={editing.schedule} dateInput={editDate}
              onChange={schedule => setEditing(current => current && { ...current, schedule })} />
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <Button type="submit">Enregistrer les modifications</Button>
              <button type="button" className="focus-ring underline" onClick={() => setEditing(null)}>Annuler</button>
            </div>
          </form>
        ) : null}
        <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="mb-3 text-left font-bold">Tableau de mes rappels</caption><thead><tr>{["À prévoir", "Date", "Répétition", "Actions"].map(c => <th key={c} className="p-3">{c}</th>)}</tr></thead><tbody>{reminders.map(r => <tr key={r.id} className={`border-t border-sanispa-line ${Date.parse(r.due_at) <= Date.now() ? "bg-amber-50" : ""}`}><td className="p-3 font-bold">{r.title}</td><td className="p-3">{new Date(r.due_at).toLocaleString("fr-FR")}</td><td className="p-3">{reminderFrequency(r)}</td><td className="p-3"><Button disabled={busy} onClick={() => void save({ action: "complete", id: r.id, version: r.version })}>C’est fait</Button><button type="button" className="focus-ring mt-2 block underline" aria-label={`Modifier le rappel ${r.title}`} onClick={() => {
          setError("");
          setMessage("");
          setEditing({ reminder: r, schedule: scheduleFor(r) });
        }}>Modifier</button><button type="button" disabled={busy} className="mt-2 block underline" onClick={() => void save({ action: "delete", type: "reminder", id: r.id })}>Supprimer ce rappel</button></td></tr>)}</tbody></table>{!reminders.length ? <p className="py-4 text-sm">Aucun rappel enregistré. Ajoutez le premier ci-dessous.</p> : null}</div>
        {!editing ? <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={addReminder}>
          <label>Type de rappel<select className={input} value={reminderKind} onChange={e => setReminderKind(e.target.value)}>{Object.entries(careKinds).filter(([k]) => k !== "observation").map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>À prévoir<input className={input} required minLength={3} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. nettoyer les filtres" /></label>
          <ScheduleFields schedule={schedule} onChange={setSchedule} />
          <Button disabled={busy} type="submit">Ajouter mon rappel</Button>
        </form> : null}<div className="mt-5"><ShopLinks problemType="traitement-eau" /></div>
      </section>
      <section className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Mon journal de bord</h2><form className="mt-4 grid gap-4" onSubmit={e => { e.preventDefault(); void save({ action: "journal", spaId, kind, date: new Date(date).toISOString(), note }); }}>
        <label>Ce que j’ai fait ou observé<select className={input} value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(careKinds).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Date de l’entretien ou de l’observation<input className={input} type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Mes notes<textarea className={input} required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><Button disabled={busy} type="submit">Ajouter à mon journal</Button>
      </form><div className="mt-5 max-w-full overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="mb-3 text-left font-bold">Tableau de mon journal</caption><thead><tr>{["Date", "Type", "Notes", "Action"].map(c => <th key={c} className="p-3">{c}</th>)}</tr></thead><tbody>{data.journal.filter(j => j.spa_id === spaId).map(j => <tr key={j.id} className="border-t border-sanispa-line"><td className="p-3">{new Date(j.performed_at).toLocaleString("fr-FR")}</td><td className="p-3">{careKinds[j.kind as keyof typeof careKinds]}</td><td className="max-w-lg whitespace-pre-wrap break-words p-3">{j.note}</td><td className="p-3"><button type="button" disabled={busy} className="underline" onClick={() => void save({ action: "delete", type: "journal", id: j.id })}>Supprimer cette entrée</button></td></tr>)}</tbody></table>{!data.journal.some(j => j.spa_id === spaId) ? <p className="py-4 text-sm">Aucun entretien ni observation enregistré. Ajoutez votre première entrée ci-dessus.</p> : null}</div></section>
      </> : null}
      {view === "releves" ?
      <section id="releves" className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Mes relevés d’eau</h2><p className="mt-2 text-sm">Une case vide signifie « non mesuré ». Reportez les valeurs de votre test avec leurs unités ; le relevé peut être transmis à votre assistant.</p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save({ action: "reading", spaId, date: new Date(readingDate).toISOString(), ...water, volume: number(water.volume), temperature: number(water.temperature), ph: number(water.ph), tac: number(water.tac), disinfectantValue: number(water.disinfectantValue) }); }}>
          <label>Date de la mesure<input className={input} type="datetime-local" required value={readingDate} onChange={e => setReadingDate(e.target.value)} /></label>
          {([{ key: "volume", label: "Volume du spa (litres)", max: 100000 }, { key: "temperature", label: "Température (°C)", max: 60 }, { key: "ph", label: "pH", max: 14 }, { key: "tac", label: "TAC (mg/L)", max: 1000 }, { key: "disinfectantValue", label: "Désinfectant mesuré (mg/L)", max: 100 }] as const).map(f => <label key={f.key}>{f.label}<input className={input} type="number" step="any" min={f.key === "volume" ? 1 : 0} max={f.max} value={water[f.key]} onChange={e => setWater(current => ({ ...current, [f.key]: e.target.value }))} /></label>)}
          <label>Désinfectant principal<select className={input} value={water.disinfectant} onChange={e => setWater(current => ({ ...current, disinfectant: e.target.value }))}>{["inconnu", "chlore", "brome", "autre", "aucun"].map(v => <option value={v} key={v}>{v}</option>)}</select></label>
          <label>Produit exact et concentration, si connus<input className={input} maxLength={300} value={water.product} onChange={e => setWater(current => ({ ...current, product: e.target.value }))} /></label>
          <label>Observations sur l’eau<textarea className={input} maxLength={2000} value={water.note} onChange={e => setWater(current => ({ ...current, note: e.target.value }))} /></label><Button disabled={busy} type="submit">Enregistrer mon relevé</Button>
        </form>
        <div className="mt-5 max-w-full overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><caption className="mb-3 text-left font-bold">Historique de mes mesures</caption><thead><tr>{["Date", "Volume L", "pH", "TAC mg/L", "°C", "Désinfectant mg/L", "Produit", "Observations", "Suite"].map(c => <th className="p-2" key={c}>{c}</th>)}</tr></thead><tbody>{data.readings.filter(r => r.spa_id === spaId).map(r => <tr key={r.id} className="border-t border-sanispa-line"><td className="p-2">{new Date(r.measured_at).toLocaleString("fr-FR")}</td><td className="p-2">{r.volume_litres ?? "—"}</td><td className="p-2">{r.ph ?? "—"}</td><td className="p-2">{r.tac ?? "—"}</td><td className="p-2">{r.temperature ?? "—"}</td><td className="p-2">{r.disinfectant} : {r.disinfectant_value ?? "—"}</td><td className="max-w-xs break-words p-2">{r.product || "—"}</td><td className="max-w-sm whitespace-pre-wrap break-words p-2">{r.note || "—"}</td><td className="p-2"><Link className="font-bold underline" href={`/premium/assistant?topic=eau&readingId=${r.id}`}>Envoyer à l’IA</Link><button disabled={busy} className="mt-2 block underline" onClick={() => void save({ action: "delete", type: "reading", id: r.id })}>Supprimer</button></td></tr>)}</tbody></table></div>
        {!data.readings.some(r => r.spa_id === spaId) ? <p className="mt-4 text-sm">Aucun relevé enregistré. Saisissez votre première mesure dans le formulaire ci-dessus.</p> : null}
      </section> : null}
      </fieldset>
    </> : null}
  </div>;
}
