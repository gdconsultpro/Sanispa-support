import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { buildSummaryPdf, sanispaCompany, summaryPdfMode } from "../lib/pdf";

async function textOf(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const streams = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    try { return [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")]; } catch { return []; }
  });
  return streams.flatMap(stream => [...stream.matchAll(/<([0-9a-f]+)>\s*Tj/gi)].map(match => Buffer.from(match[1], "hex").toString("latin1"))).join("\n");
}

test("technician search PDFs keep the logo/report/reference and omit company contacts on every page", async () => {
  const lines = ["SANISPA", "Résumé de demande d'assistance SANISPA", "Numéro de dossier : DUP-19112026-02", "Informations client", "Nom : Client fictif", "Réponses au questionnaire", ...Array.from({ length: 70 }, (_, i) => `Contrôle ${i} : Observation du spa sans manipulation.`)];
  const matchmaking = await buildSummaryPdf(lines, { mode: summaryPdfMode("intervention") });
  const company = await buildSummaryPdf(lines, { mode: summaryPdfMode("devis") });
  const reportText = await textOf(matchmaking), companyText = await textOf(company);
  assert.ok((await PDFDocument.load(matchmaking)).getPageCount() > 1);
  assert.match(reportText, /Application SANISPA/);
  assert.match(reportText, /Rapport de mise en relation/);
  assert.match(reportText, /DUP-19112026-02/);
  assert.match(reportText, /support\.sani-spa\.fr/);
  for (const contact of [sanispaCompany.phone, sanispaCompany.address, sanispaCompany.website, sanispaCompany.activity]) {
    assert.equal(reportText.includes(contact), false, contact);
    assert.equal(companyText.includes(contact), true, contact);
  }
  assert.equal(summaryPdfMode("remote"), "company");
  assert.equal(summaryPdfMode(null), "company");
  assert.equal(summaryPdfMode("devis"), "company");
  if (process.env.DOSSIER_PDF_EVIDENCE_DIR) {
    await mkdir(process.env.DOSSIER_PDF_EVIDENCE_DIR, { recursive: true });
    await writeFile(`${process.env.DOSSIER_PDF_EVIDENCE_DIR}/exemple-recherche-technicien.pdf`, matchmaking);
    await writeFile(`${process.env.DOSSIER_PDF_EVIDENCE_DIR}/exemple-demande-devis.pdf`, company);
  }
});
