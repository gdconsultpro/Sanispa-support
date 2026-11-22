import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { signatureHeight, signatureWidth, type CustomerSignature } from "./partner-field-signature";
// Contact information verified on https://www.sani-spa.fr/contact/ (18 November 2026).
export const sanispaCompany = {
  name: "SANISPA",
  activity: "Réparation, entretien et installation de spas",
  address: "Zone industrielle - 68500 Berrwiller (France)",
  phone: "03 62 02 10 55",
  website: "www.sani-spa.fr",
  support: "support.sani-spa.fr",
};
const sections = new Set([
  "Votre demande",
  "Informations client",
  "Informations spa",
  "Réponses au questionnaire",
  "Photos jointes",
  "Suivi de votre demande",
]);
export function summaryPdfMode(choice?: string | null) {
  return choice === "intervention" ? "matchmaking" as const : "company" as const;
}
export async function buildSummaryPdf(input: string[], options: {
  mode?: "matchmaking" | "company";
  field?: { company: string; photos: { bytes: Uint8Array; caption?: string }[];
    signature?: CustomerSignature & { signedAt: string } };
} = {}) {
  const matchmaking = options.mode === "matchmaking";
  const field = options.field;
  const pdf = await PDFDocument.create();
  pdf.setTitle(field ? "Compte rendu d’intervention" : "Résumé de demande d’assistance SANISPA");
  pdf.setAuthor(field?.company ?? (matchmaking ? "Application SANISPA" : sanispaCompany.name));
  pdf.setSubject(field ? "Intervention technique sur spa" : "Déclaration client - pré-diagnostic de spa");
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(
    await readFile(path.join(process.cwd(), "public/sanispa-logo.png")),
  );
  const navy = rgb(0.04, 0.14, 0.26),
    teal = rgb(0.035, 0.416, 0.502),
    muted = rgb(0.35, 0.4, 0.46),
    line = rgb(0.82, 0.89, 0.9),
    pale = rgb(0.94, 0.975, 0.975);
  const printable = (value: string) =>
    Array.from(
      value.replace(/[\u202f\u00a0]/g, " ").replace(/[\u2010-\u2015]/g, "-"),
    )
      .map((c) => {
        try {
          regular.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  const wrap = (value: string, font: PDFFont, size: number, width = 495) => {
    const out: string[] = [];
    for (const raw of printable(value).split(/\r?\n/)) {
      let row = "";
      for (const character of raw) {
        if (font.widthOfTextAtSize(row + character, size) > width) {
          const space = row.lastIndexOf(" ");
          if (space > 0) {
            out.push(row.slice(0, space));
            row = row.slice(space + 1);
          } else {
            out.push(row);
            row = "";
          }
        }
        row += character;
      }
      out.push(row);
    }
    return out;
  };
  let page!: PDFPage,
    y = 0,
    questionnaire = false;
  const text = (
    value: string,
    x: number,
    at: number,
    size = 10,
    font = regular,
    color = navy,
  ) => page.drawText(printable(value), { x, y: at, size, font, color });
  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 0,
      y: 831.89,
      width: 595.28,
      height: 10,
      color: teal,
    });
    const scale = Math.min(156 / logo.width, 57 / logo.height);
    page.drawImage(logo, {
      x: 48,
      y: 755,
      width: logo.width * scale,
      height: logo.height * scale,
    });
    (field ? ["Entreprise intervenante", ...wrap(field.company, bold, 10, 255).slice(0, 2)] :
      matchmaking ? ["APPLICATION SANISPA", "Mise en relation avec un technicien", sanispaCompany.support] : [
      sanispaCompany.activity,
      sanispaCompany.address,
      `Standard : ${sanispaCompany.phone}`,
      sanispaCompany.website,
    ]).forEach((s, index) =>
      text(s, 292, 799 - index * 14, 8.2, regular, muted),
    );
    page.drawLine({
      start: { x: 48, y: 738 },
      end: { x: 547, y: 738 },
      thickness: 1,
      color: line,
    });
    text(field ? "INTERVENTION TECHNIQUE" : matchmaking ? "CONFIRMATION DE VOTRE DEMANDE" : "VOTRE DEMANDE D’ASSISTANCE", 48, 714, 10, bold, teal);
    text(field ? "Compte rendu d’intervention" : matchmaking ? "Rapport de mise en relation" : "Résumé de votre déclaration", 48, 689, 21, bold);
    y = 662;
  };
  const ensure = (height: number) => {
    if (y - height < 64) newPage();
  };
  newPage();
  const hasTitle = input[0] === "SANISPA";
  const lines = hasTitle ? ["Votre demande", ...input.slice(2)] : input;
  for (const raw of lines) {
    if (!raw.trim()) {
      y -= 8;
      continue;
    }
    if (sections.has(raw) || field && ["Intervention", "Rapport SAV", "Installation et mise en service", "Constat sur place", "Travaux et contrôles effectués", "Suite à donner"].includes(raw)) {
      questionnaire = raw === "Réponses au questionnaire";
      ensure(72);
      y -= 8;
      page.drawRectangle({
        x: 48,
        y: y - 8,
        width: 499,
        height: 27,
        color: pale,
      });
      text(raw, 58, y + 1, 11, bold, teal);
      y -= 29;
      continue;
    }
    const split = raw.indexOf(" : ");
    if (split > 0 && split < 220) {
      const label = wrap(raw.slice(0, split), bold, 9.3),
        value = wrap(raw.slice(split + 3) || "Non renseigné", regular, 10);
      if (
        !questionnaire &&
        label.length === 1 &&
        value.length === 1 &&
        bold.widthOfTextAtSize(label[0], 9.3) +
          regular.widthOfTextAtSize(value[0], 10) <
          470
      ) {
        ensure(24);
        text(label[0] + " :", 48, y, 9.3, bold);
        text(
          value[0],
          58 + bold.widthOfTextAtSize(label[0] + " :", 9.3),
          y,
          10,
          regular,
          muted,
        );
        y -= 23;
        continue;
      }
      ensure(Math.min(70, (label.length + Math.min(value.length, 2)) * 14 + 8));
      for (const row of label) {
        ensure(14);
        text(row, 48, y, 9.3, bold);
        y -= 14;
      }
      for (const row of value) {
        ensure(14);
        text(row, 48, y, 10, regular, muted);
        y -= 14;
      }
      y -= 8;
    } else {
      for (const row of wrap(raw, regular, 10)) {
        ensure(14);
        text(row, 48, y);
        y -= 14;
      }
      y -= 5;
    }
  }
  if (field?.signature) {
    const { name, signedAt, strokes } = field.signature;
    const signer = wrap("Signé par " + name, regular, 10, 471);
    ensure(150 + signer.length * 14);
    y -= 6;
    text("Signature du client", 48, y, 12, bold, teal);
    y -= 16;
    for (const row of signer) {
      text(row, 48, y);
      y -= 14;
    }
    text(signedAt, 48, y, 9, regular, muted);
    y -= 12;
    const top = y;
    const height = 100;
    const scale = 0.36;
    const x = 58 + (479 - signatureWidth * scale) / 2;
    const originY = top - (height - signatureHeight * scale) / 2;
    page.drawRectangle({ x: 48, y: top - height, width: 499, height, borderWidth: 0.7, borderColor: line });
    for (const stroke of strokes) {
      for (let index = 1; index < stroke.length; index++) {
        const [fromX, fromY] = stroke[index - 1];
        const [toX, toY] = stroke[index];
        page.drawLine({
          start: { x: x + fromX * scale, y: originY - fromY * scale },
          end: { x: x + toX * scale, y: originY - toY * scale }, thickness: 1.4, color: navy,
        });
      }
    }
    y -= height + 18;
  }
  if (field?.photos.length) {
    newPage();
    text("Photos d’intervention", 48, y, 14, bold, teal);
    y -= 30;
    for (const [index, { bytes, caption }] of field.photos.entries()) {
      const photo = await pdf.embedJpg(bytes);
      const scale = Math.min(499 / photo.width, 250 / photo.height, 1);
      const height = photo.height * scale;
      ensure(height + 36);
      page.drawImage(photo, { x: 48, y: y - height, width: photo.width * scale, height });
      y -= height + 15;
      text(caption || `Photo ${index + 1}`, 48, y, 9, regular, muted);
      y -= 22;
    }
  }
  if (hasTitle) {
    ensure(92);
    y -= 6;
    page.drawRectangle({
      x: 48,
      y: y - 65,
      width: 499,
      height: 83,
      color: pale,
    });
    text("ET ENSUITE ?", 60, y, 10, bold, teal);
    text(
      matchmaking ? "Votre demande de mise en relation est enregistrée dans l’application SANISPA." : "SANISPA étudiera les informations transmises pour orienter votre demande.",
      60,
      y - 19,
      9,
    );
    text(
      `Retrouvez votre dossier et vos documents : ${sanispaCompany.support}`,
      60,
      y - 36,
      9,
    );
    text(
      "Aucune intervention ni date de rendez-vous n’est confirmée par ce résumé.",
      60,
      y - 53,
      8.5,
      regular,
      muted,
    );
  }
  const reference =
    input.find((s) => s.startsWith("Numéro de dossier : "))?.split(" : ")[1] ||
    "";
  const count = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => {
    p.drawLine({
      start: { x: 48, y: 49 },
      end: { x: 547, y: 49 },
      thickness: 0.6,
      color: line,
    });
    p.drawText(
      printable(
        `${matchmaking || field ? "Application SANISPA" : "SANISPA"} | ${reference ? "Dossier " + reference + " | " : ""}${matchmaking || field ? sanispaCompany.support : sanispaCompany.phone}`,
      ),
      { x: 48, y: 32, size: 8, font: regular, color: muted },
    );
    p.drawText(`${i + 1} / ${count}`, {
      x: 518,
      y: 32,
      size: 8,
      font: regular,
      color: muted,
    });
  });
  return Buffer.from(await pdf.save());
}
