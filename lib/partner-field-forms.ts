export type FieldTemplate = "sav" | "installation";
export type FieldPhotoKind = typeof fieldPhotoKinds[number];
export type FieldReportDetails = { template: FieldTemplate; answers: Record<string, string> };
type Field = { key: string; label: string; type?: "text" | "area" | "choice"; optional?: true; options?: string[] };

export const fieldPhotoKinds = ["extra", "finish", "serial", "water", "electrical", "heating", "receipt"] as const;
export const fieldPhotoLabels: Record<FieldPhotoKind, string> = {
  extra: "Photos complémentaires",
  finish: "Photos de fin de chantier",
  serial: "Photo du numéro de série",
  water: "Photos du spa en eau",
  electrical: "Installation électrique (disjoncteur, prise)",
  heating: "Test du chauffage (multimètre)",
  receipt: "Photo du justificatif de règlement",
};
export const requiredFieldPhotos: Record<FieldTemplate, FieldPhotoKind[]> = {
  sav: ["finish"],
  installation: ["serial", "water", "electrical", "heating", "finish"],
};
const spa: Field = { key: "spa", label: "Marque et modèle du spa", type: "text" };
const yesNo = (key: string, label: string): Field => ({ key, label, type: "choice" });
export const fieldForms: Record<FieldTemplate, { title: string; fields: Field[] }> = {
  sav: {
    title: "Rapport SAV",
    fields: [
      { key: "nature", label: "Nature de l’intervention", type: "text" },
      yesNo("warranty", "Garantie"),
      { key: "observations", label: "Observations", type: "area", optional: true },
      { key: "works", label: "Travaux effectués", type: "area" },
      yesNo("finished", "Intervention terminée"),
      spa,
    ],
  },
  installation: {
    title: "Installation et mise en service",
    fields: [
      spa,
      yesNo("placed", "Mise en place du spa"),
      yesNo("connected", "Raccordement de la carte mère"),
      yesNo("filled", "Mise en eau"),
      yesNo("accessories", "Montage des accessoires"),
      yesNo("cover", "Fixation des attaches de couverture"),
      yesNo("checked", "Vérification complète de l’appareil"),
      { key: "conformity", label: "Spa conforme à la commande", type: "choice", options: ["Conforme", "Non conforme"] },
      yesNo("training", "Formation à l’utilisation et à l’entretien"),
      { key: "observations", label: "Observations", type: "area" },
      yesNo("manual", "Notice transmise par le vendeur"),
      yesNo("level", "Plateforme d’accueil du spa de niveau"),
      { key: "products", label: "Produits de traitement", type: "area", optional: true },
    ],
  },
};

export const fieldChoices = ["Oui", "Non"];
export const emptyFieldNextSteps = "Aucune suite à prévoir.";

export function fieldTemplate(source: "private" | "sanispa", title: string): FieldTemplate | null {
  if (/^(installation|pose|mise en service)\b/i.test(title.trim())) return "installation";
  if (source === "sanispa") return ["demenagement", "eau", "traitement-eau"].includes(title) ? null : "sav";
  return /\bsav\b|réparation/i.test(title) ? "sav" : null;
}

export function fieldReportRows(details: FieldReportDetails) {
  return fieldForms[details.template].fields.flatMap(field => {
    const value = details.answers[field.key];
    return value ? [{ label: field.label, value }] : [];
  });
}
