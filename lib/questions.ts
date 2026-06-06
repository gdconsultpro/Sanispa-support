import { ProblemType, Question } from "@/lib/types";

export const problemTypes: Array<{ value: ProblemType; label: string }> = [
  { value: "fuite", label: "Fuite" },
  { value: "electrique", label: "Électrique" },
  { value: "traitement-eau", label: "Traitement d'eau" },
  { value: "pompe", label: "Pompe" },
  { value: "chauffage", label: "Chauffage" },
  { value: "clavier-ecran", label: "Clavier / écran" },
  { value: "filtration", label: "Filtration" },
  { value: "bruit-anormal", label: "Bruit anormal" },
  { value: "autre", label: "Autre" }
];

const yesNo = ["Oui", "Non"];

export const questionSets: Record<ProblemType, Question[]> = {
  electrique: [
    { id: "trip", label: "Le spa disjoncte-t-il ?", type: "radio", required: true, options: yesNo },
    {
      id: "trip_moment",
      label: "À quel moment ?",
      type: "radio",
      required: true,
      options: ["Dès la mise sous tension", "Quand une pompe démarre", "Quand le chauffage démarre", "Aléatoirement"]
    },
    {
      id: "breaker",
      label: "Quel disjoncteur saute ?",
      type: "radio",
      required: true,
      options: ["Différentiel 30 mA", "Disjoncteur spa", "Général", "Je ne sais pas"]
    },
    { id: "recent_refill", label: "Le spa a-t-il été remis en eau récemment ?", type: "radio", required: true, options: yesNo },
    { id: "recent_service", label: "Une intervention récente a-t-elle été faite ?", type: "radio", required: true, options: yesNo },
    { id: "has_error", label: "Y a-t-il un message d'erreur sur le clavier ?", type: "radio", required: true, options: yesNo },
    { id: "error_message", label: "Message d'erreur affiché", type: "text", showWhen: { questionId: "has_error", equals: "Oui" } }
  ],
  chauffage: [
    {
      id: "still_heating",
      label: "L'eau chauffe-t-elle encore ?",
      type: "radio",
      required: true,
      options: ["Oui", "Non", "Partiellement"]
    },
    { id: "display_temp", label: "Température affichée", type: "number", required: true },
    { id: "target_temp", label: "Température demandée", type: "number", required: true },
    { id: "error_message", label: "Message d'erreur clavier", type: "text" },
    { id: "filtration_ok", label: "La filtration fonctionne-t-elle ?", type: "radio", required: true, options: yesNo },
    { id: "circulation_pump", label: "La pompe de circulation fonctionne-t-elle ?", type: "radio", required: true, options: yesNo },
    { id: "trip_on_heat", label: "Le spa disjoncte-t-il quand le chauffage démarre ?", type: "radio", required: true, options: yesNo }
  ],
  fuite: [
    { id: "visible_leak", label: "La fuite est-elle visible ?", type: "radio", required: true, options: yesNo },
    {
      id: "spa_access",
      label: "Le spa est-il accessible ?",
      type: "radio",
      required: true,
      options: ["Oui sur les 4 côtés", "Non, seulement sur certains côtés", "Encastré ou semi-encastré"]
    },
    { id: "fast_drop", label: "Le niveau d'eau baisse-t-il rapidement ?", type: "radio", required: true, options: yesNo },
    { id: "running_only", label: "Le spa fuit-il uniquement lorsqu'il fonctionne ?", type: "radio", required: true, options: yesNo },
    {
      id: "suspected_area",
      label: "Zone suspectée",
      type: "radio",
      required: true,
      options: ["Dessous du spa", "Jets", "Pompe", "Réchauffeur", "Raccord", "Autre"]
    },
    { id: "recent_freeze", label: "Le spa a-t-il gelé récemment ?", type: "radio", required: true, options: yesNo }
  ],
  "traitement-eau": [
    { id: "water_color", label: "Aspect de l'eau", type: "radio", required: true, options: ["Claire", "Trouble", "Verte", "Moussante", "Odeur forte"] },
    { id: "last_treatment", label: "Date approximative du dernier traitement", type: "text", required: true },
    { id: "filter_cleaned", label: "Le filtre a-t-il été nettoyé récemment ?", type: "radio", required: true, options: yesNo },
    {
      id: "product_used",
      label: "Produits utilisés",
      type: "radio",
      required: true,
      options: ["Chlore", "Brome", "Oxygène actif", "Aqua finess", "O-care", "Zodiac (mineral)", "Autre"]
    },
    { id: "ph_level", label: "pH mesuré", type: "radio", required: true, options: ["Moins de 7", "Entre 7 et 7,8", "Plus de 7,8", "Je ne sais pas"] }
  ],
  pompe: [
    { id: "pump_starts", label: "La pompe démarre-t-elle ?", type: "radio", required: true, options: ["Oui", "Non", "Par intermittence"] },
    { id: "pump_noise", label: "Émet-elle un bruit inhabituel ?", type: "radio", required: true, options: yesNo },
    { id: "flow_ok", label: "Le débit d'eau semble-t-il normal ?", type: "radio", required: true, options: ["Oui", "Non", "Je ne sais pas"] },
    { id: "pump_details", label: "Précisions utiles", type: "textarea" }
  ],
  "clavier-ecran": [
    { id: "keyboard_type", label: "Type de clavier", type: "radio", required: true, options: ["Clavier à touches", "Clavier tactile", "Je ne sais pas"] },
    { id: "screen_on", label: "L'écran s'allume-t-il ?", type: "radio", required: true, options: yesNo },
    { id: "buttons_work", label: "Les touches répondent-elles ?", type: "radio", required: true, options: ["Oui", "Non", "Partiellement"] },
    { id: "error_message", label: "Code ou message affiché", type: "text" },
    { id: "humidity", label: "Présence visible d'humidité dans le clavier ?", type: "radio", required: true, options: yesNo }
  ],
  filtration: [
    { id: "filter_age", label: "Âge approximatif du filtre", type: "text", required: true },
    { id: "flow_issue", label: "Débit faible ou absent ?", type: "radio", required: true, options: ["Faible", "Absent", "Normal"] },
    { id: "filter_cleaned", label: "Le filtre a-t-il été nettoyé récemment ?", type: "radio", required: true, options: yesNo },
    { id: "screen_error", label: "Message d'erreur affiché à l'écran", type: "text" }
  ],
  "bruit-anormal": [
    { id: "noise_location", label: "Zone d'où semble venir le bruit", type: "text", required: true },
    { id: "when_noise", label: "Quand le bruit apparaît-il ?", type: "radio", required: true, options: ["Au démarrage", "En filtration", "En massage", "En chauffage", "En permanence"] },
    { id: "vibration", label: "Ressentez-vous une vibration anormale ?", type: "radio", required: true, options: yesNo },
    { id: "noise_description", label: "Décrivez le bruit", type: "textarea", required: true }
  ],
  autre: [
    { id: "description", label: "Décrivez le problème constaté", type: "textarea", required: true },
    { id: "started_when", label: "Depuis quand le problème est-il présent ?", type: "text", required: true },
    { id: "still_usable", label: "Le spa est-il encore utilisable ?", type: "radio", required: true, options: ["Oui", "Non", "Partiellement"] }
  ]
};

type PhotoRequirement = {
  id: string;
  label: string;
  required: boolean;
  problemTypes?: ProblemType[];
};

export const photoRequirements: PhotoRequirement[] = [
  { id: "keyboard", label: "Photo du clavier", required: false },
  { id: "technical_bay", label: "Photo du compartiment technique", required: false },
  { id: "serial_plate", label: "Photo de la plaque signalétique si disponible", required: false },
  { id: "visible_problem", label: "Photo du problème si visible", required: false },
  { id: "water_test", label: "Photo de la bandelette ou du relevé d'analyse", required: false, problemTypes: ["traitement-eau"] },
  { id: "filters", label: "Photo du ou des filtres", required: false, problemTypes: ["traitement-eau"] },
  { id: "water_overview", label: "Photo générale du spa en eau", required: false, problemTypes: ["traitement-eau"] }
];

export function getPhotoRequirements(problemType?: ProblemType | "") {
  if (problemType === "traitement-eau") {
    return photoRequirements.filter((photo) => photo.problemTypes?.includes("traitement-eau"));
  }

  return photoRequirements.filter((photo) => !photo.problemTypes);
}

export function isPhotoRequired(photoId: string, problemType?: ProblemType | "") {
  return photoId === "keyboard" && problemType === "electrique";
}

export const remotePlans = [
  { id: "water", name: "Assistant traitement d'eau", price: 19, stripeEnv: "STRIPE_PRICE_WATER_ASSISTANT" },
  { id: "photo", name: "Diagnostic photo", price: 49, stripeEnv: "STRIPE_PRICE_DIAGNOSTIC_PHOTO" },
  { id: "guided", name: "Assistance guidée", price: 89, stripeEnv: "STRIPE_PRICE_ASSISTANCE_GUIDED" },
  { id: "premium", name: "Assistance premium", price: 129, stripeEnv: "STRIPE_PRICE_ASSISTANCE_PREMIUM" }
] as const;
