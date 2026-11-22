"use client";

import Link from "next/link";
import { Camera, ClipboardCheck, MapPin, Phone, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/Button";
import { partnerEquipmentEndpoint, PartnerSpaOptions } from "@/components/PartnerClientSpas";
import { PartnerVisitDelete } from "@/components/PartnerVisitDelete";
import { PartnerVisitUnplan } from "@/components/PartnerVisitUnplan";
import { localDateTime } from "@/lib/client-browser-api";
import { compressPhoto } from "@/lib/compress-photo";
import { partnerAuthError } from "@/lib/partner-browser";
import type { FieldSource, FieldVisit } from "@/lib/partner-field";
import { partnerClientPath, partnerDirections, partnerEditVisitPath, partnerSpaOption, plannerDate } from "@/lib/partner-planner";
import { plannerRequest } from "@/lib/partner-planner-browser";
import { workStatusLabels, workspacePath } from "@/lib/partner-workspace";

const card = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const input = "focus-ring mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-sanispa-line bg-white p-2.5 text-base font-normal";
const link = "focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline";
const dateLabel = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
type Draft = { id: string; performed: string; findings: string; actions: string; nextSteps: string; onSite: boolean };
const emptyDraft: Draft = { id: "", performed: "", findings: "", actions: "", nextSteps: "", onSite: false };

function draftOnDevice(key: string, reports: FieldVisit["reports"], start?: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Draft> | null;
    if (saved?.id && reports.some(report => report.id === saved.id)) localStorage.removeItem(key);
    else if (saved?.id && typeof saved.performed === "string" && typeof saved.findings === "string" &&
      typeof saved.actions === "string" && typeof saved.nextSteps === "string" && typeof saved.onSite === "boolean")
      return { id: saved.id, performed: saved.performed, findings: saved.findings, actions: saved.actions, nextSteps: saved.nextSteps, onSite: saved.onSite };
  } catch { /* The form still works when local storage is unavailable. */ }
  return { ...emptyDraft, performed: start ? localDateTime(new Date(start)) : "" };
}

export function PartnerFieldVisit({ id, source }: { id: string; source: FieldSource }) {
  const base = `/api/partner/field/${source}/${id}`;
  const [data, setData] = useState<FieldVisit | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [draftNote, setDraftNote] = useState("");
  const [spaId, setSpaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmValidation, setConfirmValidation] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<{ id: string; file: File }[]>([]);
  const working = useRef(false);
  const draftKey = useRef("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const result: (FieldVisit & { userId: string }) | null = await plannerRequest(base, { signal });
    if (!result || signal?.aborted) return;
    setData(result);
    if (signal) {
      setSpaId(result.spaId ?? "");
      draftKey.current = source === "sanispa" ? `sanispa-report-v1:${result.userId}:${id}` : `sanispa-field-private:${result.userId}:${id}`;
      const restored = draftOnDevice(draftKey.current, result.reports, result.session?.started_at);
      setDraft(restored);
      if (restored.id) setDraftNote("Brouillon retrouvé sur cet appareil.");
    }
    return result;
  }, [base, id, source]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [load]);
  const available = Boolean(data);
  useEffect(() => {
    if (!available) return;
    const hash = window.location.hash.slice(1);
    if (["rapport", "rendez-vous", "photos"].includes(hash)) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [available]);

  function editDraft(changes: Partial<Draft>) {
    const next = { ...draft, id: draft.id || crypto.randomUUID(), ...changes };
    setDraft(next);
    try {
      localStorage.setItem(draftKey.current, JSON.stringify(next));
      setDraftNote("Brouillon enregistré sur cet appareil.");
    } catch { setDraftNote("Gardez la page ouverte pour conserver cette saisie."); }
  }

  async function action(run: () => Promise<unknown>, message: string, after?: () => void) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!await run()) return;
      after?.();
      setNotice(message);
      const result = await load();
      if (result) {
        setSpaId(result.spaId ?? "");
        if (result.session && !result.session.submitted_at)
          setDraft(current => current.performed ? current : { ...current, performed: localDateTime(new Date(result.session!.started_at)) });
      }
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { working.current = false; setBusy(false); }
  }

  function photoUrl(session: string, photo: string) {
    return base + "?" + new URLSearchParams({ session, photo });
  }
  function uploadPhotos() {
    const session = data?.session;
    if (!session || !pendingPhotos.length) return;
    void action(async () => {
      for (const { id, file } of pendingPhotos) {
        const encoded = await compressPhoto(file);
        const blob = await (await fetch(encoded)).blob();
        if (!await plannerRequest(photoUrl(session.id, id), { photo: blob })) return null;
        setPendingPhotos(current => current.filter(photo => photo.id !== id));
      }
      return true;
    }, "Photos enregistrées.");
  }

  function managePrivate(kind: "deleteVisit" | "unplanVisit") {
    return action(async () => {
      const result = await plannerRequest("/api/partner/planning", { payload: { action: kind, id, expected_at: data?.version } });
      if (result && kind === "deleteVisit") {
        window.location.assign("/partenaire/interventions");
        return null;
      }
      return result;
    }, "L’intervention est de nouveau à planifier.");
  }

  const session = data?.session;
  const spa = data?.spas.find(item => item.id === data.spaId);
  const draftOpen = Boolean(session && !session.submitted_at);
  const active = data && !["review", "validated", "closed", "followup"].includes(data.workStatus);
  const phone = data?.customer.phone?.replace(/[^+\d]/g, "");
  return <div className="mt-4 grid gap-4">
    {error ? <div className="rounded-xl bg-red-50 p-3 text-red-800">
      <p role="alert">{error}</p>
      <button type="button" className={link} disabled={busy} onClick={() => {
        setError("");
        void load(new AbortController().signal).catch(cause => setError(partnerAuthError(cause)));
      }}>Actualiser la fiche</button>
    </div> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-900">{notice}</p> : null}
    {!data && !error ? <p role="status">Chargement de la fiche terrain…</p> : null}
    {data ? <>
      <section className={card} id="rendez-vous" aria-labelledby="field-customer">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="field-customer" className="break-words text-xl font-bold">{data.customer.name}</h2>
            <p className="break-words text-sm">{data.title}{data.reference ? " · " + data.reference : ""}</p>
          </div>
          <span className="rounded-lg bg-sanispa-ice px-2.5 py-1 text-sm font-bold">{workStatusLabels[data.workStatus]}</span>
        </div>
        {data.customer.address ? <p className="mt-2 break-words">{data.customer.address}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {phone ? <a aria-label="Appeler le client" href={"tel:" + phone} className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-xl bg-sanispa-blue px-4 font-bold text-white">
            <Phone aria-hidden="true" size={18} /> Appeler
          </a> : null}
          {data.customer.address ? <a href={partnerDirections(data.customer.address)} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-xl border border-sanispa-line px-4 font-bold">
            <MapPin aria-hidden="true" size={18} /> Itinéraire
          </a> : null}
        </div>
        {data.appointment ? <p className="mt-3 text-sm font-semibold">{dateLabel.formatRange(new Date(data.appointment.starts_at), new Date(data.appointment.ends_at))}</p>
          : <p className="mt-3 text-sm">Rendez-vous à planifier.</p>}
        {session ? <p className="mt-1 text-sm">Démarrée le {dateLabel.format(new Date(session.started_at))}</p> : null}
        {data.description ? <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-sanispa-ice p-3 text-sm">{data.description}</p> : null}
      </section>

      <section className={card} aria-labelledby="field-spa">
        <h2 id="field-spa" className="text-lg font-bold">Spa concerné</h2>
        <p className="mt-1 break-words">{spa ? partnerSpaOption(spa) : data.declaredSpa || "Spa à renseigner"}</p>
        {data.canEditSpa && data.spas.length ? <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => {
          event.preventDefault();
          void action(() => source === "private"
            ? plannerRequest(base, { payload: { action: "spa", spaId: spaId || null, version: data.version } })
            : plannerRequest(partnerEquipmentEndpoint, { payload: { action: "linkDossierSpa", client_id: data.customer.clientId, diagnostic_id: id, spa_id: spaId || null } }),
          "Spa rattaché à l’intervention.");
        }}>
          <label className="min-w-0 flex-1 text-sm font-bold">Spa dans le carnet
            <select value={spaId} onChange={event => setSpaId(event.target.value)} className={input} disabled={busy}><PartnerSpaOptions spas={data.spas} /></select>
          </label>
          <Button type="submit" variant="secondary" disabled={busy || spaId === (data.spaId ?? "")}>Enregistrer le spa</Button>
        </form> : null}
        {data.customer.clientId ? <Link href={partnerClientPath(data.customer.clientId)} className={link}>Fiche client et équipements</Link> : null}
      </section>

      {active && data.appointment && !session ? <Button type="button" disabled={busy} onClick={() => {
        void action(() => plannerRequest(base, { payload: { action: "start" } }), "Intervention démarrée.");
      }}><Play aria-hidden="true" size={18} /> Démarrer l’intervention</Button> : null}
      {active && !session && data.appointment && !data.canStart ? <p className="text-sm text-sanispa-steel">Le démarrage est disponible à l’heure du rendez-vous.</p> : null}
      {draftOpen || data.photos.length ? <section className={card} id="photos" aria-labelledby="field-photos">
        <h2 id="field-photos" className="text-lg font-bold">Photos d’intervention</h2>
        {draftOpen ? <>
          <p className="mt-1 text-sm">{source === "sanispa" ? "Les photos seront accessibles au client avec le compte rendu." : "Les photos sont visibles dans votre entreprise."}</p>
          <div className="my-2 flex flex-wrap items-center gap-2">
            <label className="focus-within:ring-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-sanispa-line px-3 text-sm font-bold">
              <Camera aria-hidden="true" size={18} /> Prendre une photo
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only"
                disabled={busy || data.photos.length + pendingPhotos.length >= 12} onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) setPendingPhotos(current => [...current, { id: crypto.randomUUID(), file }]);
                  event.target.value = "";
                }} />
            </label>
            <label className="focus-within:ring-2 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-sanispa-line px-3 text-sm font-bold">
              Choisir des photos
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
                disabled={busy || data.photos.length + pendingPhotos.length >= 12} onChange={event => {
                  const files = Array.from(event.target.files ?? []).slice(0, 12 - data.photos.length - pendingPhotos.length);
                  setPendingPhotos(current => [...current, ...files.map(file => ({ id: crypto.randomUUID(), file }))]);
                  event.target.value = "";
                }} />
            </label>
          </div>
          {pendingPhotos.length ? <div>
            <ul className="text-sm">{pendingPhotos.map(({ id, file }) => <li key={id} className="flex items-center gap-3 break-all">
              {file.name}<button type="button" className={link} disabled={busy} onClick={() => setPendingPhotos(current => current.filter(photo => photo.id !== id))}>Retirer de la sélection</button>
            </li>)}</ul>
            <Button type="button" variant="secondary" onClick={uploadPhotos} disabled={busy}>Enregistrer les photos sélectionnées</Button>
          </div> : null}
        </> : null}
        {data.photos.length ? <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{data.photos.map((photo, index) => <li key={photo.id}>
          <a className="focus-ring block" href={photo.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} className="aspect-square w-full rounded-lg object-cover" loading="lazy" alt={`Photo d’intervention ${index + 1}`} />
          </a>
          {draftOpen && session ? <button type="button" className={link} disabled={busy} onClick={() =>
            void action(() => plannerRequest(photoUrl(session.id, photo.id), { method: "DELETE" }), "Photo retirée.")}>Retirer la photo {index + 1}</button> : null}
        </li>)}</ul> : null}
      </section> : null}

      <section className={card} id="rapport" aria-labelledby="field-report">
        <h2 id="field-report" className="text-lg font-bold">Compte rendu</h2>
        {draftOpen && session ? <form className="mt-3" onSubmit={event => {
          event.preventDefault();
          if (pendingPhotos.length) { setError("Enregistrez ou retirez les photos sélectionnées avant de transmettre le compte rendu."); return; }
          const performed = new Date(draft.performed);
          if (!draft.id || !Number.isFinite(+performed) || !draft.onSite) return;
          void action(() => plannerRequest(base, { payload: {
            action: "report", session: session.id, id: draft.id, performedAt: performed.toISOString(),
            findings: draft.findings, actions: draft.actions, nextSteps: draft.nextSteps, onSite: draft.onSite,
          } }), source === "sanispa" ? "Compte rendu transmis au client pour validation." : "Compte rendu transmis au responsable pour validation.", () => {
            try { localStorage.removeItem(draftKey.current); } catch { /* Cleared on the next load. */ }
            setDraft(emptyDraft);
            setDraftNote("");
          });
        }}>
          {draftNote ? <p role="status" className="mb-2 text-sm font-semibold text-sanispa-steel">{draftNote}</p> : null}
          <fieldset disabled={busy} className="grid min-w-0 gap-3">
            <label className="min-w-0 text-sm font-bold">Date et heure de l’intervention
              <input className={input} type="datetime-local" required value={draft.performed} onChange={event => editDraft({ performed: event.target.value })} />
            </label>
            {([
              ["findings", "Constat sur place", 20, 5000], ["actions", "Travaux et contrôles effectués", 20, 5000],
              ["nextSteps", "Suite à donner", 5, 3000],
            ] as const).map(([key, label, min, max]) => <label key={key} className="text-sm font-bold">{label}
              <textarea className={input} rows={3} minLength={min} maxLength={max} required value={draft[key]} onChange={event => editDraft({ [key]: event.target.value })} />
            </label>)}
            <label className="flex items-start gap-2 py-2 text-sm"><input type="checkbox" required checked={draft.onSite}
              onChange={event => editDraft({ onSite: event.target.checked })} className="mt-0.5 h-5 w-5" /> Je confirme avoir réalisé l’intervention sur place.</label>
            <Button type="submit"><ClipboardCheck aria-hidden="true" size={18} /> Transmettre pour validation</Button>
          </fieldset>
        </form> : null}
        {data.reports.map(report => <article key={report.id} className="mt-3 rounded-xl border border-sanispa-line p-3">
          <p className="text-sm font-semibold">{dateLabel.format(new Date(report.performed_at))}</p>
          <dl className="mt-2 grid gap-1 text-sm">
            <dt className="font-bold">Constat</dt><dd className="whitespace-pre-wrap break-words">{report.findings}</dd>
            <dt className="mt-2 font-bold">Travaux et contrôles</dt><dd className="whitespace-pre-wrap break-words">{report.actions}</dd>
            <dt className="mt-2 font-bold">Suite à donner</dt><dd className="whitespace-pre-wrap break-words">{report.next_steps}</dd>
          </dl>
          {source === "sanispa" ? <p className="mt-3 text-sm font-bold">{report.client_validated_at ? "Validé par le client" : "En attente de validation par le client"}</p> : null}
        </article>)}
        {!draftOpen && !data.reports.length ? <p className="mt-2 text-sm">{data.workStatus === "review" || data.workStatus === "validated"
          ? "Cette intervention a été enregistrée sans compte rendu terrain." : "Démarrez l’intervention pour rédiger son compte rendu."}</p> : null}
        {data.canValidate ? <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmValidation ? <>
            <Button type="button" disabled={busy} onClick={() => void action(() => plannerRequest(base, {
              payload: { action: "validate", version: data.version },
            }), "Compte rendu validé.", () => setConfirmValidation(false))}>Confirmer la validation</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmValidation(false)}>Annuler</Button>
          </> : <Button type="button" disabled={busy} onClick={() => setConfirmValidation(true)}>{data.reports.length ? "Valider le compte rendu" : "Valider l’intervention"}</Button>}
        </div> : null}
      </section>

      {source === "sanispa" ? <Link className={link} href={`/partenaire/interventions/${id}/gestion#rendez-vous`}>Gestion du dossier SANISPA</Link> : <details className={card}>
        <summary className="cursor-pointer font-bold">Gestion de l’intervention</summary>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          {active && !session ? <ButtonLink variant="secondary" href={partnerEditVisitPath(id)}>{data.appointment ? "Modifier le rendez-vous" : "Planifier le rendez-vous"}</ButtonLink> : null}
          <Link className={link} href={workspacePath("map", {
            ...(data.appointment ? { day: plannerDate(new Date(data.appointment.starts_at)), period: "day" } : {}), status: data.workStatus,
          }, "private:" + id)}>Retrouver sur la carte</Link>
          {active && !session ? <PartnerVisitDelete disabled={busy} onDelete={() => managePrivate("deleteVisit")} /> : null}
          {active && !session && data.appointment && Date.parse(data.appointment.starts_at) > Date.now() ?
            <PartnerVisitUnplan disabled={busy} onUnplan={() => managePrivate("unplanVisit")} /> : null}
        </div>
      </details>}
    </> : null}
  </div>;
}
