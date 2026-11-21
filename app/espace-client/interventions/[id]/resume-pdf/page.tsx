"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { clientCaseLoginPath, clientCaseReturnPath, clientDossierPath, clientSummaryPdfPath } from "@/lib/client-case-navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function ClientSummaryPdfPage() {
  const { id } = useParams<{ id: string }>();
  const destination = clientSummaryPdfPath(id);
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    async function loadPdf() {
      setPdfUrl("");
      setError("");
      if (!clientCaseReturnPath(destination)) {
        setError("Dossier introuvable.");
        return;
      }
      try {
        const { data } = await getSupabaseBrowser().auth.getSession();
        if (controller.signal.aborted) return;
        if (!data.session) {
          window.location.replace(clientCaseLoginPath(destination));
          return;
        }
        const response = await fetch(`/api/client/documents/${encodeURIComponent(id)}/pdf`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.location.replace(clientCaseLoginPath(destination));
          return;
        }
        if (response.status === 404) {
          setError("Ce résumé est introuvable ou inaccessible depuis votre compte.");
          return;
        }
        if (!response.ok) throw new Error("PDF indisponible");
        const pdf = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(pdf);
        setPdfUrl(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError("Le résumé n’a pas pu être chargé. Actualisez la page pour réessayer.");
      }
    }
    void loadPdf();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [destination, id]);

  return (
    <AppShell compact>
      <Link href={clientDossierPath(id)} className="font-bold underline">← Mon dossier</Link>
      <h1 className="mt-5 text-3xl font-bold">Résumé de ma déclaration</h1>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : null}
      {!error && !pdfUrl ? <p role="status" className="mt-4">Chargement de votre résumé PDF…</p> : null}
      {pdfUrl ? (
        <>
          <div className="my-4 flex flex-wrap items-center gap-4">
            <a href={pdfUrl} download="resume-sanispa.pdf" className="focus-ring rounded-full bg-sanispa-blue px-4 py-3 font-bold text-white">Télécharger le PDF</a>
            <a href={pdfUrl} target="_blank" rel="noopener" className="focus-ring font-bold underline">Ouvrir le PDF</a>
          </div>
          <iframe src={pdfUrl} title="Résumé PDF de ma déclaration" className="h-[65vh] min-h-80 w-full rounded-xl border border-sanispa-line bg-white" />
        </>
      ) : null}
    </AppShell>
  );
}
