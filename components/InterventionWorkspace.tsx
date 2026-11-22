"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { PrivateFile } from "./PrivateFile";
import { PartnerAssignedVisitInfo, type PartnerAssignedVisit } from "./PartnerAssignedVisitInfo";
import { Button } from "./Button";
import { localDateTime } from "@/lib/client-browser-api";
import { partnerLoginPath } from "@/lib/partner-navigation";
import { clientCaseLoginPath, clientCaseReturnPath, clientDossierPath } from "@/lib/client-case-navigation";
import { partnerWorkLabels, partnerWorkState } from "@/lib/partner-work";
import { fieldReportFilename, type FieldPhoto } from "@/lib/partner-field";
type Report = { id: string; performed_at: string; submitted_at: string; findings: string; actions: string; next_steps: string; client_validated_at: string | null;
  client_outcome: "repaired" | "quote_pending" | "abandoned" | null; responsiveness: number | null; professionalism: number | null; pricing: number | null;
  signedPdf?: boolean };
type Workspace = { dossierReference?: string; dossierStatus?: string; assignedPartner?: boolean; appointment: { starts_at: string; ends_at: string } | null; reports: Report[]; invoices: { id: string; file_name: string }[]; job?: PartnerAssignedVisit };
const outcomes = { repaired: "Spa réparé", quote_pending: "Devis en cours", abandoned: "Projet abandonné" } as const;
const criteria = [{ key: "responsiveness", label: "Réactivité" }, { key: "professionalism", label: "Professionnalisme" }, { key: "pricing", label: "Tarif" }] as const;
const inputClass = "mt-2 w-full rounded-xl border border-sanispa-line bg-white p-3 text-sanispa-navy";

function ClientReportPhotos({ load }: { load: () => Promise<{ photos: FieldPhoto[] }> }) {
  const [photos, setPhotos] = useState<FieldPhoto[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return <details className="mt-3" onToggle={event => {
    if (!event.currentTarget.open || loading) return;
    setLoading(true);
    setError("");
    void load().then(result => setPhotos(result.photos)).catch(cause => setError(cause instanceof Error ? cause.message : "Photos indisponibles."))
      .finally(() => setLoading(false));
  }}>
    <summary className="cursor-pointer text-sm font-bold underline">Photos du compte rendu</summary>
    {loading ? <p role="status" className="text-sm">Chargement des photos…</p> : null}
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    {photos?.length ? <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{photos.map((photo, index) => <li key={photo.id}>
      <a href={photo.url} target="_blank" rel="noreferrer" className="focus-ring block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} className="aspect-square w-full rounded-lg object-cover" alt={`Photo du rapport ${index + 1}`} loading="lazy" />
      </a>
    </li>)}</ul> : photos && !loading && !error ? <p className="text-sm">Aucune photo jointe à ce compte rendu.</p> : null}
  </details>;
}
export function InterventionWorkspace({ id, role }: { id: string; role: "client" | "partner" }) {
  const base = `/api/${role}/interventions/${id}`;
  const [data, setData] = useState<Workspace | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [editingAppointment, setEditingAppointment] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [file, setFile] = useState<File | null>(null), [outcome, setOutcome] = useState<"" | keyof typeof outcomes>("");
  const [ratings, setRatings] = useState({ responsiveness: 0, professionalism: 0, pricing: 0 });
  const pending = useRef(false);
  const request = useCallback(async (url: string, init?: RequestInit) => {
    const redirectToLogin = () => {
      const dossier = clientDossierPath(id);
      const destination = clientCaseReturnPath(dossier + window.location.hash) || dossier;
      window.location.replace(role === "partner"
        ? partnerLoginPath("/partenaire/interventions/" + id + "/gestion")
        : clientCaseLoginPath(destination));
    };
    const { data: auth } = await getSupabaseBrowser().auth.getSession();
    if (!auth.session) {
      if (!init?.signal?.aborted) redirectToLogin();
      throw new Error("Reconnectez-vous pour accéder à votre dossier.");
    }
    const response = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${auth.session.access_token}` }, cache: "no-store" });
    const body = await response.json();
    if (response.status === 401 && !init?.signal?.aborted) redirectToLogin();
    if (!response.ok) throw new Error(body.error || "Opération impossible. Réessayez.");
    return body;
  }, [id, role]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const body: Workspace = await request(base, { signal });
    if (signal?.aborted) return;
    setData(body);
    if (role === "partner") {
      setStart(body.appointment ? localDateTime(new Date(body.appointment.starts_at)) : "");
      setEnd(body.appointment ? localDateTime(new Date(body.appointment.ends_at)) : "");
    }
  }, [base, request, role]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [load]);
  const dataReady = Boolean(data);
  useEffect(() => {
    if (!dataReady) return;
    const section = window.location.hash.slice(1);
    if (["validation", "rendez-vous", "rapport", "factures"].includes(section))
      document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [role, dataReady]);
  async function save(body: unknown, success: string, afterSave?: () => void) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await request(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      afterSave?.();
      setMessage(success);
      try { await load(); } catch { setError("Enregistrement confirmé. Actualisez la page pour afficher le dossier à jour."); }
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
  const closed = Boolean(last?.client_validated_at && last.client_outcome !== "quote_pending") || data?.dossierStatus === "CLOSED" || data?.dossierStatus === "terminé";
  const workState = data ? partnerWorkState(data.dossierStatus, data.appointment, data.reports, Boolean(data.invoices.length), Date.now()) : null;
  const nextSection = workState === "invoice" ? "factures" : workState === "report" ? "rapport" : workState === "contact" || workState === "upcoming" ? "rendez-vous" : null;
  return <div className="mt-6 grid gap-6">
    {data?.dossierReference ? <p className="font-bold">Dossier n°{data.dossierReference}</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={() => { setError(""); void load().catch(e => setError(e.message)); }}>Actualiser</button></p> : null}
    {message ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{message}</p> : null}
    {!data && !error ? <p role="status">Chargement du suivi…</p> : null}
    {!data && error && role === "partner" ? <button type="button" className="font-bold underline" onClick={() => window.location.reload()}>Réessayer</button> : null}
    {data ? <>
      {role === "partner" && workState ? <section className="rounded-2xl border border-sanispa-line bg-sanispa-ice p-5">
        <p className="text-sm">{data.dossierReference || "Référence en cours"}</p>
        <h2 className="mt-1 text-xl font-bold">{partnerWorkLabels[workState]}</h2>
        {workState === "invoice" ? <p className="mt-2">Le compte rendu est transmis. Le client a besoin de la facture pour confirmer une réparation.</p> : null}
        {nextSection ? <a href={nextSection === "rapport" ? "/partenaire/interventions/" + id + "#rapport" : "#" + nextSection} className="mt-3 inline-block font-bold underline">{workState === "invoice" ? "Déposer la facture" : workState === "report" ? "Rédiger le compte rendu" : workState === "contact" ? "Planifier la visite" : "Voir le rendez-vous"}</a> : null}
      </section> : null}
      {role === "partner" && data.job && (workState === "upcoming" || workState === "contact" || Boolean(!closed && data.appointment && Date.parse(data.appointment.ends_at) > Date.now())) ?
        <PartnerAssignedVisitInfo id={id} key={id} job={data.job} /> : null}
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
      <section id="rendez-vous" className="scroll-mt-4 rounded-2xl border border-sanispa-line bg-white p-5">
        <h2 className="text-xl font-bold">{role === "client" ? "Rendez-vous" : "1. Le rendez-vous"}</h2>
        <p className="mt-3">{data.appointment ? `${new Date(data.appointment.starts_at).toLocaleString("fr-FR")} → ${new Date(data.appointment.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : role === "client" && !data.assignedPartner ? "Aucun rendez-vous n’est prévu pour le moment." : "Le partenaire n’a pas encore renseigné le rendez-vous."}</p>
        {role === "partner" && !closed ? <>
          {data.appointment && !editingAppointment ? <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" type="button" disabled={busy} onClick={() => setEditingAppointment(true)}>Modifier le rendez-vous</Button>
            {Date.parse(data.appointment.starts_at) > Date.now() ? <Button variant="ghost" type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>Annuler le rendez-vous</Button> : null}
          </div> : null}
          {confirmCancel && data.appointment ? <div className="mt-4 rounded-xl bg-amber-50 p-4">
            <p>Le créneau sera retiré du dossier et de la vue du client.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void save({ action: "cancel_appointment", start: data.appointment!.starts_at, end: data.appointment!.ends_at }, "Rendez-vous annulé.", () => setConfirmCancel(false))}>Confirmer l’annulation</Button>
              <Button variant="secondary" type="button" disabled={busy} onClick={() => setConfirmCancel(false)}>Garder le rendez-vous</Button>
            </div>
          </div> : null}
          {!confirmCancel && (!data.appointment || editingAppointment) ? <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event => {
            event.preventDefault();
            if (!start || !end || Date.parse(end) <= Date.parse(start)) {
              setError("Sélectionnez une heure de fin postérieure au début du rendez-vous.");
              return;
            }
            void save({ action: "schedule", start: new Date(start).toISOString(), end: new Date(end).toISOString() }, "Rendez-vous enregistré et visible par le client.", () => setEditingAppointment(false));
          }}>
            <label className="min-w-0">Début du rendez-vous<input className={inputClass} type="datetime-local" value={start} required onChange={e => setStart(e.target.value)} /></label>
            <label className="min-w-0">Fin du rendez-vous<input className={inputClass} type="datetime-local" value={end} required onChange={e => setEnd(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button disabled={busy} type="submit">Enregistrer le rendez-vous</Button>
              {editingAppointment && data.appointment ? <Button type="button" variant="secondary" disabled={busy} onClick={() => {
                setStart(localDateTime(new Date(data.appointment!.starts_at)));
                setEnd(localDateTime(new Date(data.appointment!.ends_at)));
                setEditingAppointment(false);
              }}>Revenir au créneau actuel</Button> : null}
            </div>
          </form> : null}
        </> : null}
      </section>
      <section id="rapport" className="scroll-mt-4 rounded-2xl border border-sanispa-line bg-white p-5">
        <h2 className="text-xl font-bold">{role === "client" ? "Comptes rendus" : "2. Le compte rendu sur place"}</h2>
        {!data.reports.length ? <p className="mt-3">{role === "client" ? "Aucun compte rendu disponible pour cette demande." : "Le compte rendu sera disponible après l’intervention."}</p> : null}
        {data.reports.map(report => <article className="mt-4 rounded-xl bg-sanispa-ice p-4" key={report.id}>
          <h3 className="font-bold">Intervention du {new Date(report.performed_at).toLocaleString("fr-FR")}</h3>
          {role === "client" && report.signedPdf ? <PrivateFile
            url={base + "?rapport=" + report.id} name={fieldReportFilename(report.id)} label="Télécharger le PDF signé" /> : null}
          <dl className="mt-3 grid gap-2"><dt className="font-bold">Constats</dt><dd className="whitespace-pre-wrap break-words">{report.findings}</dd><dt className="font-bold">Travaux et contrôles effectués</dt><dd className="whitespace-pre-wrap break-words">{report.actions}</dd><dt className="font-bold">Suite prévue</dt><dd className="whitespace-pre-wrap break-words">{report.next_steps}</dd></dl>
          <p className="mt-3 font-bold">{report.client_validated_at && report.client_outcome ? `${outcomes[report.client_outcome]} · Validé par le client` : "En attente de validation par le client"}</p>
          {role === "client" ? <ClientReportPhotos load={() => request(base + "?photos=" + report.id)} /> : null}
          {report.client_validated_at ? <p className="mt-2 text-sm">Réactivité : {report.responsiveness}/5 · Professionnalisme : {report.professionalism}/5 · Tarif : {report.pricing}/5</p> : null}
        </article>)}
      </section>
      <section id="factures" className="scroll-mt-4 rounded-2xl border border-sanispa-line bg-white p-5">
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
    </> : null}
  </div>;
}
