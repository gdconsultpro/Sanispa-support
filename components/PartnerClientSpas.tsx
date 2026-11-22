"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { PartnerSpaMaintenance } from "@/components/PartnerSpaMaintenance";
import { compressPhoto } from "@/lib/compress-photo";
import { partnerAuthError } from "@/lib/partner-browser";
import { partnerSpaName, partnerSpaOption, type PartnerClientSpa } from "@/lib/partner-planner";
import { plannerRequest } from "@/lib/partner-planner-browser";

export const partnerEquipmentEndpoint = "/api/partner/equipment";
const panel = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const input = "focus-ring mt-1 min-h-12 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-3 py-2 text-base";
const action = "focus-ring inline-flex min-h-11 items-center text-left text-sm font-bold text-sanispa-blue underline";

export function PartnerSpaOptions({ spas }: { spas: PartnerClientSpa[] }) {
  return <>
    <option value="">Aucun spa associé</option>
    {spas.map(spa => <option key={spa.id} value={spa.id}>{partnerSpaOption(spa)}</option>)}
  </>;
}

export function PartnerClientSpas({ clientId, spas, busy, onChange, onVisit }: {
  clientId: string; spas: PartnerClientSpa[]; busy: boolean; onChange: () => void; onVisit: (spa: PartnerClientSpa) => void;
}) {
  const [editor, setEditor] = useState<{ id: string; current?: PartnerClientSpa } | null>(null);
  const [gallery, setGallery] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const editorId = editor?.id;
  useEffect(() => { if (editorId) heading.current?.focus(); }, [editorId]);

  function edit(spa?: PartnerClientSpa) {
    setError("");
    setNotice("");
    setEditor({ id: spa?.id ?? crypto.randomUUID(), current: spa });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const result = await plannerRequest(partnerEquipmentEndpoint, { payload: {
        action: "saveSpa", client_id: clientId, id: editor.id, expected_at: editor.current?.updated_at ?? null,
        brand: String(form.get("brand") ?? ""), model: String(form.get("model") ?? ""), serial_number: String(form.get("serial_number") ?? ""),
      } });
      if (!result) return;
      if (!editor.current) setGallery(editor.id);
      setNotice(editor.current ? "Le spa a été mis à jour." : "Le spa a été ajouté à la fiche.");
      setEditor(null);
      onChange();
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { setSaving(false); }
  }

  return <section className={panel} aria-labelledby="partner-client-spas">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold" id="partner-client-spas">Spas du client</h2>
      <Button type="button" variant="secondary" disabled={busy || saving || editor !== null} onClick={() => edit()}>Ajouter un spa</Button>
    </div>
    {notice ? <p role="status" className="mt-2 text-sm font-bold text-emerald-800">{notice}</p> : null}
    {editor ? <form key={editor.id} onSubmit={save} className="my-3 min-w-0 rounded-xl border border-sanispa-line p-3">
      <h3 ref={heading} tabIndex={-1} className="font-bold">{editor.current ? "Modifier le spa" : "Nouveau spa"}</h3>
      <fieldset disabled={saving || busy} className="mt-2 grid min-w-0 gap-2 sm:grid-cols-3">
        <label className="min-w-0 text-sm font-bold">Marque<input name="brand" className={input} required maxLength={100} defaultValue={editor.current?.brand} /></label>
        <label className="min-w-0 text-sm font-bold">Modèle<input name="model" className={input} maxLength={100} defaultValue={editor.current?.model} /></label>
        <label className="min-w-0 text-sm font-bold">Numéro de série<input name="serial_number" className={input} maxLength={100} defaultValue={editor.current?.serial_number} /></label>
        {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-3">{error}</p> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button type="submit">{saving ? "Enregistrement…" : "Enregistrer le spa"}</Button>
          <Button type="button" variant="secondary" onClick={() => setEditor(null)}>Annuler</Button>
        </div>
      </fieldset>
    </form> : null}
    {spas.length ? <ul className="mt-2 divide-y divide-sanispa-line">
      {spas.map(spa => <li key={spa.id} className="py-3">
        <h3 className="break-words font-bold">{partnerSpaName(spa)}</h3>
        {spa.serial_number ? <p className="break-all text-sm">N° de série {spa.serial_number}</p> : null}
        <div className="flex flex-wrap gap-x-4">
          <button type="button" className={action} aria-expanded={gallery === spa.id} disabled={busy || saving}
            onClick={() => setGallery(gallery === spa.id ? null : spa.id)}>{gallery === spa.id ? "Masquer les photos" : "Voir ou ajouter des photos"}</button>
          <button type="button" className={action} disabled={busy || saving || editor !== null} onClick={() => edit(spa)}>Modifier le spa</button>
          <button type="button" className={action} disabled={busy || saving || editor !== null} onClick={() => onVisit(spa)}>Intervention sur ce spa</button>
          <button type="button" className={action} aria-expanded={maintenance === spa.id} disabled={busy || saving}
            onClick={() => setMaintenance(maintenance === spa.id ? null : spa.id)}>Entretien récurrent</button>
        </div>
        {gallery === spa.id ? <SpaPhotos clientId={clientId} spa={spa} /> : null}
        {maintenance === spa.id ? <PartnerSpaMaintenance endpoint={partnerEquipmentEndpoint} clientId={clientId} spaId={spa.id} /> : null}
      </li>)}
    </ul> : !editor ? <p className="mt-2 text-sm">Aucun spa enregistré pour ce client.</p> : null}
  </section>;
}

type PhotoPage = { photos: { id: string; url: string }[]; more: boolean };
type PendingPhoto = { id: string; file: File };

function SpaPhotos({ clientId, spa }: { clientId: string; spa: PartnerClientSpa }) {
  const [page, setPage] = useState<PhotoPage | null>(null);
  const [files, setFiles] = useState<PendingPhoto[]>([]);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const base = partnerEquipmentEndpoint + "?" + new URLSearchParams({ client: clientId, spa: spa.id });

  useEffect(() => {
    const controller = new AbortController();
    setPage(null);
    setLoadError("");
    void plannerRequest(base + "&offset=" + offset, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && result) setPage(result);
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [base, offset, revision]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || saving) return;
    setSaving(true);
    setUploadError("");
    const failed: PendingPhoto[] = [];
    for (const pending of files) {
      try {
        const encoded = await compressPhoto(pending.file);
        const photo = await (await fetch(encoded)).blob();
        if (!await plannerRequest(base + "&photo=" + pending.id, { photo })) throw new Error("Reconnectez-vous pour envoyer la photo.");
      } catch (cause) {
        failed.push(pending);
        setUploadError(partnerAuthError(cause));
      }
    }
    setFiles(failed);
    if (field.current) field.current.value = "";
    setSaving(false);
    setOffset(0);
    setRevision(value => value + 1);
  }

  async function removePhoto(id: string) {
    if (saving) return;
    setSaving(true);
    setUploadError("");
    try {
      if (!await plannerRequest(base + "&photo=" + id, { method: "DELETE" })) return;
      setConfirmPhoto(null);
      setOffset(0);
      setRevision(value => value + 1);
    } catch (cause) { setUploadError(partnerAuthError(cause)); }
    finally { setSaving(false); }
  }

  return <div className="mt-2 rounded-xl bg-sanispa-ice p-3">
    <form onSubmit={upload} className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 text-sm font-bold">Photos du spa
        <input ref={field} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={saving}
          className={input} onChange={event => {
            setUploadError("");
            setFiles(Array.from(event.currentTarget.files ?? [], file => ({ id: crypto.randomUUID(), file })));
          }} />
      </label>
      <Button type="submit" disabled={!files.length || saving}>{saving ? "Envoi des photos…" : "Ajouter les photos"}</Button>
    </form>
    {uploadError ? <p role="alert" className="mt-2 text-sm text-red-800">{files.length ? `${files.length} photo(s) à renvoyer. ` : ""}{uploadError}</p> : null}
    {loadError ? <div className="mt-2"><p role="alert" className="text-sm text-red-800">{loadError}</p>
      <button type="button" className={action} onClick={() => setRevision(value => value + 1)}>Réessayer</button></div>
      : !page ? <p role="status" className="mt-2 text-sm">Chargement des photos…</p>
      : page.photos.length ? <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {page.photos.map((photo, index) => <li key={photo.id}>
          <a href={photo.url} target="_blank" rel="noreferrer" className="focus-ring block rounded-lg bg-white">
            <Image unoptimized width={260} height={160} src={photo.url} alt={`Photo ${offset + index + 1} de ${partnerSpaName(spa)}`}
              referrerPolicy="no-referrer" className="h-28 w-full rounded-lg object-contain" />
          </a>
          {confirmPhoto === photo.id ? <div className="mt-1 text-sm">
            <p>Supprimer cette photo ?</p>
            <div className="flex flex-wrap gap-x-2">
              <button type="button" className={action} disabled={saving} onClick={() => void removePhoto(photo.id)}>Confirmer</button>
              <button type="button" className={action} disabled={saving} onClick={() => setConfirmPhoto(null)}>Annuler</button>
            </div>
          </div> : <button type="button" className={action} disabled={saving} onClick={() => setConfirmPhoto(photo.id)}>Supprimer la photo</button>}
        </li>)}</ul> : <p className="mt-2 text-sm">Aucune photo ajoutée.</p>}
    {page && (offset > 0 || page.more) ? <div className="mt-2 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={offset === 0} onClick={() => setOffset(value => value - 12)}>Précédent</Button>
      <Button type="button" variant="secondary" disabled={!page.more} onClick={() => setOffset(value => value + 12)}>Suivant</Button>
    </div> : null}
  </div>;
}
