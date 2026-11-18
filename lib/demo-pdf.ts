import { paymentsPaused } from "./commercial-mode";
import type { DemoState } from "./demo";
export type DemoPdfKind = "summary" | "report" | "invoice" | "charter" | "manual";
export const demoDocumentTitles: Record<DemoPdfKind, string> = { summary: "Résumé de demande", report: "Rapport d’intervention", invoice: "Facture d’intervention", charter: "Charte partenaire", manual: "Présentation des notices" };
export function demoDocumentLines(kind: DemoPdfKind, state: DemoState): string[] {
  const common = ["Dossier DEMO-001 - Camille D. (personnage fictif)", "Atelier Aqua - partenaire fictif", "Nantes 44000 - adresse de demonstration"];
  if (kind === "invoice") return [...common, "Reference : DEMO-FAC-001", "Joint et deplacement - exemple d'intervention", "Montant HT : 150,00 EUR", "TVA 20 % : 30,00 EUR", "Total TTC : 180,00 EUR", "Ce document n'est ni une facture reelle ni une demande de paiement."];
  if (kind === "report") return [...common, "Constat : " + (state.report?.findings || "Exemple de constat du technicien sur place."), "Action : " + (state.report?.actions || "Exemple de remplacement d'un joint et de controle."), "Suite : " + (state.report?.next || "Exemple de suivi apres l'intervention."), "Validation et notes du client : a illustrer dans l'espace client de demonstration."];
  if (kind === "charter") return ["Exemple de charte partenaire SANISPA", "Utilisation des coordonnees uniquement pour la mission confiee.", "Aucune revente ou reutilisation des contacts pour du demarchage.", "Respect des clients et retour d'information sur les interventions.", paymentsPaused() ? "Abonnement et contacts offerts pendant la phase d’essai. Aucun reglement." : "Gestion et communication : 350 EUR TTC par mois, puis contacts selon la grille.", "L'attribution reste soumise a la validation de SANISPA.", "Cet exemple ne recueille aucun engagement contractuel."];
  if (kind === "manual") return ["Exemple de recherche d'une notice par marque et reference.", "Notices en francais : Balboa TP500 et SpaTouch - Gecko serie in.k - SpaNET SV et SV Mini.", "La vraie application propose les ressources fabricant verifiees disponibles.", "Ce PDF illustre le service. Il ne remplace aucune notice constructeur et ne contient aucune instruction technique."];
  return [...common, `Spa : ${state.spa.brand} - ${state.spa.model}`, `Volume : ${state.spa.volume}`, `Motif de demonstration : ${state.problem}`, `${state.photos.length} illustrations jointes`, "Une declaration detaillee permet a SANISPA d'orienter la demande.", "Le client retrouve gratuitement le suivi, les rapports et les factures de ses interventions."];
}
export async function buildDemoPdf(kind: DemoPdfKind, state: DemoState, logo?: Uint8Array) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create(); pdf.setTitle("SANISPA DEMONSTRATION - " + demoDocumentTitles[kind]); pdf.setAuthor("SANISPA - document fictif");
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const image = logo ? await pdf.embedPng(logo) : null;
  const safe = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ");
  let page = pdf.addPage([595, 842]), y = 650;
  function decorate() {
    if (image) page.drawImage(image, { x: 45, y: 737, width: 72, height: 62 });
    page.drawText("SANISPA SUPPORT", { x: image ? 135 : 45, y: 775, size: 19, font: bold, color: rgb(.04,.14,.26) });
    page.drawText(safe(demoDocumentTitles[kind]), { x: image ? 135 : 45, y: 750, size: 13, font: regular });
    page.drawRectangle({ x: 45, y: 697, width: 505, height: 28, color: rgb(1,.94,.79) });
    page.drawText("DEMONSTRATION - SANS VALEUR COMPTABLE", { x: 58, y: 707, size: 10, font: bold });
    page.drawText("Fictif - aucun paiement, aucun dossier client reel", { x: 45, y: 43, size: 9, font: regular, color: rgb(.35,.4,.46) });
    page.drawText("SANISPA - support.sani-spa.fr/demo", { x: 45, y: 28, size: 9, font: regular, color: rgb(.35,.4,.46) });
  }
  decorate();
  for (const paragraph of demoDocumentLines(kind, state)) {
    let line = "";
    for (const word of safe(paragraph).split(" ")) {
      if (regular.widthOfTextAtSize(line + " " + word, 11) > 500 && line) {
        if (y < 90) { page = pdf.addPage([595,842]); decorate(); y = 650; }
        page.drawText(line, { x: 45, y, size: 11, font: regular }); y -= 19; line = word;
      } else line += (line ? " " : "") + word;
    }
    if (y < 90) { page = pdf.addPage([595,842]); decorate(); y = 650; }
    page.drawText(line, { x: 45, y, size: 11, font: regular }); y -= 33;
  }
  return pdf.save();
}
