"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { PrivateFile } from "./PrivateFile";
import { Button } from "./Button";
type Report = { id: string; performed_at: string; findings: string; actions: string; next_steps: string; client_validated_at: string | null;
  client_outcome: "repaired" | "quote_pending" | "abandoned" | null; responsiveness: number | null; professionalism: number | null; pricing: number | null };
type Workspace = { dossierReference?: string; dossierStatus?: string; assignedPartner?: boolean; appointment: { starts_at: string; ends_at: string } | null; reports: Report[]; invoices: { id: string; file_name: string }[] };
const outcomes = { repaired: "Spa réparé", quote_pending: "Devis en cours", abandoned: "Projet abandonné" } as const;
const criteria = [{ key: "responsiveness", label: "Réactivité" }, { key: "professionalism", label: "Professionnalisme" }, { key: "pricing", label: "Tarif" }] as const;
const inputClass = "mt-2 w-full rounded-xl border border-sanispa-line bg-white p-3 text-sanispa-navy";
export function InterventionWorkspace({ id, role }: { id: string; role: "client" | "partner" }) {
  const base = `/api/${role}/interventions/${id}`;
  const [data, setData] = useState<Workspace | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [performed, setPerformed] = useState("");
  const [findings, setFindings] = useState(""), [actions, setActions] = useState(""), [nextSteps, setNextSteps] = useState(""), [onSite, setOnSite] = useState(false);
  const [file, setFile] = useState<File | null>(null), [outcome, setOutcome] = useState<"" | keyof typeof outcomes>("");
  const [ratings, setRatings] = useState({ responsiveness: 0, professionalism: 0, pricing: 0 });
  const reportId = useRef<string | null>(null), pending = useRef(false);
  async function request(url: string, init?: RequestInit) {
    const { data: auth } = await getSupabaseBrowser().auth.getSession();
    if (!auth.session) throw new Error("Reconnectez-vous pour accéder à votre dossier.");
    const response = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${auth.session.access_token}` }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Opération impossible. Réessayez.");
    return body;
  }
  const load = useCallback(async (signal?: AbortSignal) => {
    const body: Workspace = await request(base, { signal });
    if (!signal?.aborted) setData(body);
  }, [base]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [load]);
  const dataReady = Boolean(data);
  useEffect(() => {
    if (role !== "client" || !dataReady) return;
    const section = window.location.hash.slice(1);
    if (["validation", "rendez-vous", "rapport", "factures"].includes(section))
      document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [role, dataReady]);
  async function save(body: unknown, success: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await request(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setMessage(success); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function uploadInvoice() {
    if (!file || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      await request(`${base}/invoice`, { method: "POST", body: form });
      setFile(null); setMessage("Facture déposée dans le dossier du client."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Dépôt impossible."); }
    finally { pending.current = false; setBusy(false); }
  }
  const waiting = data?.reports.find(r => !r.client_validated_at);
  const last = data?.reports[0];
  const closed = Boolean(last?.client_validated_at && last.client_outcome !== "quote_pending");
  return <div className="mt-6 grid gap-6">
    {data?.dossierReference ? <p className="font-bold">Dossier n°{data.dossierReference}</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={() => { setError(""); void load().catch(e => setError(e.message)); }}>Actualiser</button></p> : null}
    {message ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{message}</p> : null}
    {!data ? <p role="status">Chargement du suivi…</p> : <>
      {role === "client" ? (
        <section className="rounded-2xl border border-sanispa-line bg-white p-5">
          <h2 className="text-xl font-bold">{waiting ? "Votre compte rendu est prêt" : closed || data.dossierStatus === "CLOSED" || data.dossierStatus === "terminé" ? "Votre dossier est terminé" : "Votre demande est enregistrée"}</h2>
          <p className="mt-2">{waiting ? "Lisez le compte rendu, puis indiquez où en est votre spa." : "Retrouvez ci-dessous les informations communiquées pour votre demande."}</p>
          {waiting ? <a href="#validation" className="mt-3 inline-block font-bold underline">Valider le rapport</a> : null}
          <div className="mt-3 text-sm">
            <p>Résumé de votre déclaration (PDF)</p>
            <PrivateFile url={`/api/client/documents/${id}/pdf`} name={`Résumé SANISPA ${data.dossierReference || ""}.pdf`} />
          </div>
        </section>
      ) : null}
      <section id={role === "client" ? "rendez-vous" : undefined} className="scroll-mt-4 rounded-2xl border border-sanispa-line bg-white p-5">
        <h2 className="text-xl font-bold">{role === "client" ? "Rendez-vous" : "1. Le rendez-vous"}</h2>
        <p className="mt-3">{data.appointment ? `${new Date(data.appointment.starts_at).toLocaleString("fr-FR")} → ${new Date(data.appointment.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : role === "client" && !data.assignedPartner ? "Aucun rendez-vous n’est prévu pour le moment." : "Le partenaire n’a pas encore renseigné le rendez-vous."}</p>
        {role === "partner" && !closed ? <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save({ action: "schedule", start: new Date(start).toISOString(), end: new Date(end).toISOString() }, "Rendez-vous enregistré et visible par le client."); }}>
          <label>Début du rendez-vous<input className={inputClass} type="datetime-local" value={start} required onChange={e => setStart(e.target.value)} /></label>
          <label>Fin du rendez-vous<input className={inputClass} type="datetime-local" value={end} required onChange={e => setEnd(e.target.value)} /></label>
          <Button disabled={busy} type="submit">Enregistrer le rendez-vous</Button>
        </form> : null}
      </section>
      <section id={role === "client" ? "rapport" : undefined} className="scroll-mt-4 rounded-2xl border border-sanispa-line bg-white p-5">
        <h2 className="text-xl font-bold">{role === "client" ? "Comptes rendus" : "2. Le compte rendu sur place"}</h2>
        {!data.reports.length ? <p className="mt-3">{role === "client" ? "Aucun compte rendu disponible pour cette demande." : "Le compte rendu sera disponible après l’intervention."}</p> : null}
        {data.reports.map(report => <article className="mt-4 rounded-xl bg-sanispa-ice p-4" key={report.id}>
          <h3 className="font-bold">Intervention du {new Date(report.performed_at).toLocaleString("fr-FR")}</h3>
          <dl className="mt-3 grid gap-2"><dt className="font-bold">Constats</dt><dd className="whitespace-pre-wrap break-words">{report.findings}</dd><dt className="font-bold">Travaux et contrôles effectués</dt><dd className="whitespace-pre-wrap break-words">{report.actions}</dd><dt className="font-bold">Suite prévue</dt><dd className="whitespace-pre-wrap break-words">{report.next_steps}</dd></dl>
          <p className="mt-3 font-bold">{report.client_validated_at && report.client_outcome ? `${outcomes[report.client_outcome]} · Validé par le client` : "En attente de validation par le client"}</p>
          {report.client_validated_at ? <p className="mt-2 text-sm">Réactivité : {report.responsiveness}/5 · Professionnalisme : {report.professionalism}/5 · Tarif : {report.pricing}/5</p> : null}
        </article>)}
        {role === "partner" && !waiting && !closed ? <form className="mt-5 grid gap-4" onSubmit={e => {
          e.preventDefault(); reportId.current ??= crypto.randomUUID();
          void save({ action: "report", id: reportId.current, performedAt: new Date(performed).toISOString(), findings, actions, nextSteps, onSite }, "Compte rendu transmis au client pour validation.");
        }}>
          <p className="text-sm">Remplissez ce rapport pendant votre visite. Après envoi, son contenu est conservé sans modification. Un nouveau rapport pourra être ajouté après la validation du devis en cours.</p>
          <label>Date et heure de l’intervention<input className={inputClass} type="datetime-local" required value={performed} onChange={e => setPerformed(e.target.value)} /></label>
          <label>Ce que vous avez constaté<textarea className={inputClass} minLength={20} maxLength={5000} required value={findings} onChange={e => setFindings(e.target.value)} /></label>
          <label>Ce que vous avez fait et vérifié<textarea className={inputClass} minLength={20} maxLength={5000} required value={actions} onChange={e => setActions(e.target.value)} /></label>
          <label>Ce qui reste à faire / suite convenue<textarea className={inputClass} minLength={5} maxLength={3000} required value={nextSteps} onChange={e => setNextSteps(e.target.value)} /></label>
          <label className="flex items-start gap-3"><input type="checkbox" required checked={onSite} onChange={e => setOnSite(e.target.checked)} className="mt-1" />Je confirme remplir ce compte rendu sur place lors de cette intervention.</label>
          <Button disabled={busy} type="submit">Transmettre mon compte rendu</Button>
        </form> : null}
      </section>
      <section id={role === "client" ? "factures" : undefined} className="scroll-mt-4 rounded-2xl border border-sanispa-line bg-white p-5">
        <h2 className="text-xl font-bold">{role === "client" ? "Factures d’intervention" : "3. Les factures d’intervention"}</h2>
        {role === "partner" ? <p className="my-3 text-sm">Chaque facture doit être déposée par le partenaire dans ce dossier. Elle est nécessaire pour clôturer une réparation.</p> : null}
        <div className="grid gap-2">{data.invoices.map(invoice => <div key={invoice.id}><p className="font-bold">{invoice.file_name}</p><PrivateFile url={`/api/files/document?id=${invoice.id}`} name={invoice.file_name} /></div>)}</div>
        {!data.invoices.length ? <p className="mt-3">{role === "client" ? "Aucune facture disponible pour cette demande." : "Facture non encore déposée."}</p> : null}
        {role === "partner" ? <form className="mt-4 grid gap-3" onSubmit={e => { e.preventDefault(); void uploadInvoice(); }}>
          <label>Votre facture PDF (3 Mo maximum)<input className={inputClass} type="file" required accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
          <Button disabled={busy || !file} type="submit">Déposer la facture du client</Button>
        </form> : null}
      </section>
      {role === "client" && waiting ? <section id="validation" className="scroll-mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-xl font-bold">Votre validation et votre avis</h2>
        <p className="mt-2">Après avoir lu le compte rendu, indiquez où en est votre projet et évaluez les trois critères.</p>
        <a href="#rapport" className="mt-2 inline-block text-sm font-bold underline">Relire le compte rendu</a>
        <form className="mt-5 grid gap-5" onSubmit={e => { e.preventDefault(); void save({ reportId: waiting.id, outcome, ...ratings }, "Merci ! Votre validation et votre avis sont enregistrés."); }}>
          <fieldset><legend className="font-bold">Quelle est la situation de votre spa ?</legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{Object.entries(outcomes).map(([value, label]) => <label className="flex gap-2 rounded-xl bg-white p-4" key={value}><input type="radio" name="outcome" required value={value} checked={outcome === value} onChange={() => setOutcome(value as keyof typeof outcomes)} />{label}</label>)}</div></fieldset>
          {outcome === "repaired" && !data.invoices.length ? <p className="text-sm font-bold">Votre partenaire doit encore déposer sa facture avant cette validation.</p> : null}
          {criteria.map(({ key, label }) => <fieldset key={key}><legend className="font-bold">{label} *</legend><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map(value => <label key={value} className={`cursor-pointer rounded-lg border px-3 py-2 ${ratings[key] === value ? "border-sanispa-blue bg-white" : "border-transparent"}`}><input type="radio" name={key} value={value} required checked={ratings[key] === value} onChange={() => setRatings(current => ({ ...current, [key]: value }))} /><span aria-hidden="true" className="ml-2 text-amber-600">★</span><span className="ml-1">{value}/5</span></label>)}</div></fieldset>)}
          <Button disabled={busy || (outcome === "repaired" && !data.invoices.length)} type="submit">Valider le compte rendu et envoyer mon avis</Button>
        </form>
      </section> : null}
      {role === "partner" ? <Link href={`/partenaire/leads/${id}`} className="font-bold underline">Retrouver les coordonnées, photos et documents du dossier</Link> : null}
    </>}
  </div>;
}
