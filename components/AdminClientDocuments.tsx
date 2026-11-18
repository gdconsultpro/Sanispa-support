"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { downloadBlob } from "@/lib/download";
import type { AdminClientDocument } from "@/lib/admin-dossier";

function attachmentLabel(document: AdminClientDocument, diagnosticId: string) {
  if (!document.diagnostic_id) return "Non rattaché à un dossier";
  if (document.diagnostic_id === diagnosticId) return "Rattaché à ce dossier";
  return `Rattaché à un autre dossier : ${document.diagnostic_id}`;
}

function dateLabel(value: string | null) {
  if (!value) return "Date non renseignée";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Paris",
      }).format(date)
    : "Date non disponible";
}

export function AdminClientDocuments({
  diagnosticId,
  documents,
  error,
}: {
  diagnosticId: string;
  documents: AdminClientDocument[];
  error?: string | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null),
    [kind, setKind] = useState("Facture d’intervention"),
    [uploading, setUploading] = useState(false),
    [notice, setNotice] = useState("");
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentType", kind);
      const response = await fetch(
        `/api/admin/diagnostics/${diagnosticId}/documents`,
        { method: "POST", body: form },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice("Document ajouté et disponible dans le compte du client.");
      setFile(null);
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Dépôt impossible.");
    } finally {
      setUploading(false);
    }
  }
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const requestPending = useRef(false);

  async function download(document: AdminClientDocument) {
    if (requestPending.current) return;
    requestPending.current = true;
    setDownloading(document.id);
    setDownloadError("");
    try {
      const response = await fetch(
        `/api/admin/documents/${encodeURIComponent(document.id)}`,
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new Error(
            "Votre accès administrateur doit être vérifié. Reconnectez-vous avant de télécharger ce document.",
          );
        const data = await response.json().catch(() => null);
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Le téléchargement n’a pas pu démarrer. Réessayez.",
        );
      }
      const blob = await response.blob();
      if (!blob.size)
        throw new Error(
          "Le document reçu est vide. Rechargez le dossier ou réessayez.",
        );
      downloadBlob(blob, document.file_name);
    } catch (cause) {
      setDownloadError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : "Le téléchargement a été interrompu. Vérifiez votre connexion et réessayez.",
      );
    } finally {
      requestPending.current = false;
      setDownloading(null);
    }
  }

  return (
    <section className="mt-4 min-w-0 border-t border-sanispa-line pt-4">
      <h3 className="font-bold text-sanispa-navy">Documents du client</h3>
      <p className="mt-1 text-xs text-sanispa-steel">
        Le rattachement indique si le document concerne ce dossier, un autre
        dossier ou aucun dossier. Dates affichées à l’heure de Paris.
      </p>
      <form
        onSubmit={upload}
        className="my-4 grid gap-3 rounded-xl bg-sanispa-ice p-4"
      >
        <h4 className="font-bold">Ajouter un document pour le client</h4>
        <label className="grid gap-2 text-sm">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="focus-ring rounded-md border p-3"
          >
            {[
              "Facture d’intervention",
              "Devis",
              "Compte rendu d’intervention",
              "Autre document SANISPA",
            ].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Fichier (3 Mo maximum)
          <input
            required
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="focus-ring mt-2 block w-full"
          />
        </label>
        <Button disabled={uploading || !file} type="submit">
          {uploading ? "Dépôt en cours…" : "Déposer dans le compte client"}
        </Button>
        {notice ? (
          <p role="status" className="text-sm">
            {notice}
          </p>
        ) : null}
      </form>
      {error ? (
        <p
          className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {downloadError ? (
        <p
          className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {downloadError}
        </p>
      ) : null}
      {!documents.length && !error ? (
        <p className="mt-3 text-sm text-sanispa-steel">
          Aucun document client trouvé pour ce dossier ou ce compte.
        </p>
      ) : null}
      {documents.length ? (
        <ul className="mt-3 grid gap-3">
          {documents.map((document) => (
            <li
              key={document.id}
              className="min-w-0 rounded-md border border-sanispa-line bg-sanispa-ice p-3 text-sm"
            >
              <p className="break-all font-bold text-sanispa-navy">
                {document.file_name}
              </p>
              <p className="mt-1 text-sanispa-steel">
                {document.document_type || "Type de document non renseigné"} ·{" "}
                {dateLabel(document.created_at)}
              </p>
              <p className="mt-1 break-all text-sanispa-steel">
                {attachmentLabel(document, diagnosticId)}
              </p>
              {document.spa_id ? (
                <p className="mt-1 text-sanispa-steel">
                  Également rattaché à un spa.
                </p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="mt-3 max-w-full"
                disabled={downloading !== null}
                onClick={() => void download(document)}
              >
                {downloading === document.id
                  ? "Préparation du téléchargement…"
                  : "Télécharger le document"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
