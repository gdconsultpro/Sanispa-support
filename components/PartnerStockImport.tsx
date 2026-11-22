"use client";

import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/Button";
import { plannerRequest } from "@/lib/partner-planner-browser";
import { maxStockCsvBytes } from "@/lib/partner-stock-csv";

type Preview = { count: number; invalid: number; errors: string[]; sample: {
  category: "piece" | "spa"; label: string; reference: string; quantity: number;
}[] };
const endpoint = "/api/partner/planning/stock-import";

export function PartnerStockImport({ onImported }: { onImported: (imported: number, skipped: number) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<{ name: string; csv: string; preview: Preview } | null>(null);
  const [error, setError] = useState("");

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setFile(null);
    setError("");
    if (!selected) return;
    if (!/\.csv$/i.test(selected.name) || selected.size > maxStockCsvBytes) {
      setError("Choisissez un fichier CSV de 2 Mo maximum.");
      return;
    }
    setPending(true);
    try {
      const csv = await selected.text();
      const preview: Preview | null = await plannerRequest(endpoint, { payload: { csv, preview: true } });
      if (preview) setFile({ name: selected.name, csv, preview });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Le fichier n’a pas pu être lu.");
    } finally {
      setPending(false);
    }
  }

  async function importFile() {
    if (!file || file.preview.invalid || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await plannerRequest(endpoint, { payload: { csv: file.csv, preview: false } });
      if (result) {
        setFile(null);
        setOpen(false);
        onImported(result.imported, result.skipped);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "L’import n’a pas pu être enregistré.");
    } finally {
      setPending(false);
    }
  }

  return <div className="mt-3">
    <Button type="button" variant="secondary" aria-expanded={open} disabled={pending} onClick={() => {
      setOpen(!open);
      setError("");
      setFile(null);
    }}>{open ? "Fermer l’import" : "Importer un CSV"}</Button>
    {open ? <section className="mt-3 min-w-0 rounded-xl border border-sanispa-line bg-sanispa-ice p-4" aria-label="Import du stock">
      <p className="text-sm">Exportez votre tableau au format CSV UTF-8. Le fichier peut contenir jusqu’à 5 000 articles et peser 2 Mo.</p>
      <a href="/modele-stock-sanispa.csv" download className="focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline">Télécharger le modèle CSV</a>
      <label className="block text-sm font-bold">Fichier CSV
        <input type="file" accept=".csv,text/csv" disabled={pending} onChange={selectFile}
          className="focus-ring mt-1 block min-h-11 w-full max-w-md rounded-md border border-sanispa-line bg-white p-2" />
      </label>
      {pending ? <p className="mt-2 text-sm" role="status">Traitement du fichier…</p> : null}
      {error ? <p className="mt-2 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      {file ? <div className="mt-3">
        <p className="break-all text-sm font-bold">{file.name} · {file.preview.count} {file.preview.count === 1 ? "ligne valide" : "lignes valides"}</p>
        {file.preview.invalid ? <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          <p className="font-bold">{file.preview.invalid} {file.preview.invalid === 1 ? "ligne à corriger" : "lignes à corriger"}.</p>
          <ul className="list-inside list-disc">{file.preview.errors.map(message => <li key={message}>{message}</li>)}</ul>
        </div> : null}
        {file.preview.sample.length ? <ul aria-label="Aperçu des premiers articles" className="mt-2 divide-y divide-sanispa-line rounded-lg bg-white px-3">
          {file.preview.sample.map((row, index) => <li key={index} className="flex flex-wrap justify-between gap-x-4 py-2 text-sm">
            <span className="min-w-0 break-words"><strong>{row.label}</strong> · {row.category === "spa" ? "Spa" : "Pièce détachée"}{row.reference ? " · " + row.reference : ""}</span>
            <span>Quantité {row.quantity}</span>
          </li>)}
        </ul> : null}
        <p className="my-2 text-sm">L’import ajoute les nouveaux articles. Les références déjà présentes dans la même catégorie sont ignorées. Pour les articles sans référence, le nom sert à repérer les doublons.</p>
        <Button type="button" disabled={pending || file.preview.invalid > 0} onClick={() => void importFile()}>Confirmer l’import</Button>
      </div> : null}
    </section> : null}
  </div>;
}
