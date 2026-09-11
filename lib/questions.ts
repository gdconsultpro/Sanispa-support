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

export const unknown = "Je ne sais pas";
export const unavailableValues = ["Valeur inconnue", "Écran illisible", "Non observable", "Non applicable"];
const yesNo = ["Oui", "Non", unknown, "Non observable"];
const radio = (id: string, label: string, options = yesNo, extra: Partial<Question> = {}): Question => ({ id, label, type: "radio", options, ...extra });
const multi = (id: string, label: string, options: string[], extra: Partial<Question> = {}): Question => ({ id, label, type: "checkbox", options: [...options, unknown, "Non observable"], ...extra });
const text = (id: string, label: string, extra: Partial<Question> = {}): Question => ({ id, label, type: "text", ...extra });
const number = (id: string, label: string, extra: Partial<Question> = {}): Question => ({ id, label, type: "number", unknownOptions: unavailableValues, min: 0, ...extra });
const when = (questionId: string, ...values: string[]) => ({ questionId, values });
const events = ["Remplissage", "Nettoyage", "Coupure de courant", "Intervention", "Gel", "Pluie", "Orage", "Fuite", "Remplacement du filtre", "Aucun événement identifié"];
export const spaAccessQuestion = radio("spa_access", "Le spa est-il accessible ?", ["Oui sur les 4 côtés", "Non, seulement sur certains côtés", "Encastré ou semi-encastré", unknown], { help: "Indiquez les accès existants, sans déplacer ni démonter le spa." });
export const photoUnavailableQuestion = radio("keyboard_photo_unavailable", "Pourquoi ne pouvez-vous pas joindre la photo du clavier ?", ["Clavier inaccessible sans démontage", "Impossible de prendre une photo avec mon appareil", "Autre impossibilité"], { required: true });
export const photoUnavailableDetail = text("keyboard_photo_unavailable_detail", "Précisez pourquoi la photo est impossible", { required: true, showWhen: when("keyboard_photo_unavailable", "Autre impossibilité") });
export const diagnosticSafety = "Décrivez uniquement ce que vous avez déjà observé. Ne démontez rien, ne touchez pas la pompe pour vérifier sa température et ne reproduisez pas une disjonction. Vous pouvez laisser les informations inconnues ou inaccessibles non renseignées.";
const common: Question[] = [
  text("started_when", "Depuis quand le problème est-il présent ?", { section: "Contexte du problème" }),
  radio("problem_frequency", "Le problème est-il permanent ou intermittent ?", ["Permanent", "Intermittent", unknown]),
  multi("triggering_events", "Après quel événement le problème est-il apparu ?", events, { help: "Plusieurs réponses possibles. Décrivez la chronologie observée, sans en déduire la cause." }),
  text("recent_service_details", "Quelle intervention a été effectuée ?", { showWhenAny: [when("triggering_events", "Intervention"), when("recent_service", "Oui")] }),
  text("actions_tried", "Actions déjà essayées et résultat obtenu", { type: "textarea", help: "Facultatif : relatez les essais passés, sans en effectuer de nouveaux pour ce formulaire." }),
  radio("has_error", "Un code ou message d’erreur est-il affiché ?", ["Oui", "Non", "Écran éteint", "Écran illisible", "Code inconnu", unknown]),
  text("error_message", "Code ou message affiché (si lisible)", { showWhen: { ...when("has_error", "Oui"), legacyWhenUnanswered: true } }),
  radio("recent_refill", "Remise en eau récente (réponse précédente)", yesNo, { legacyOnly: true }),
  radio("recent_service", "Intervention récente (réponse précédente)", yesNo, { legacyOnly: true }),
  radio("recent_freeze", "Gel récent (réponse précédente)", yesNo, { legacyOnly: true }),
];
export const pumpSymptoms = {
  silent: "Ne démarre pas et ne fait aucun bruit", hum: "Ronronne mais ne semble pas démarrer", flow: "Débit faible ou absent", noise: "Bruit inhabituel",
  immediateTrip: "Disjonction au démarrage de la pompe", delayedTrip: "Disjonction après quelques minutes", stop: "S’arrête seule après quelques minutes",
  leak: "Fuite visible au niveau de la pompe", heat: "Échauffement inhabituel déjà constaté", smell: "Odeur de brûlé déjà constatée", speed: "Une seule vitesse fonctionne (si plusieurs vitesses existent)", other: "Autre symptôme"
};
const specific: Record<ProblemType, Question[]> = {
  pompe: [
    radio("pump_type", "Quelle pompe semble concernée ?", ["Pompe de massage", "Pompe de circulation / filtration", "Plusieurs pompes", unknown]),
    multi("pump_symptoms", "Quels symptômes avez-vous déjà observés ?", Object.values(pumpSymptoms)),
    radio("pump_starts", "La pompe démarre-t-elle ?", ["Oui", "Non", "Par intermittence", unknown, "Non observable"], { hideWhen: when("pump_symptoms", pumpSymptoms.silent, pumpSymptoms.hum) }),
    radio("pump_noise", "Émet-elle un bruit inhabituel ?", yesNo, { hideWhen: when("pump_symptoms", pumpSymptoms.noise, pumpSymptoms.hum) }),
    radio("flow_ok", "Le débit d’eau semble-t-il normal ?", yesNo, { hideWhen: when("pump_symptoms", pumpSymptoms.flow) }),
    text("pump_stop_delay", "Après combien de temps la pompe s’arrête-t-elle environ ?", { showWhen: when("pump_symptoms", pumpSymptoms.stop) }),
    radio("pump_restart_observed", "Un redémarrage ultérieur a-t-il déjà été observé ?", yesNo, { showWhen: when("pump_symptoms", pumpSymptoms.stop) }),
    text("pump_details", "Précisions utiles sur les symptômes", { type: "textarea" }),
  ],
  electrique: [
    radio("power_supply_known", "Alimentation connue", ["230V", "400V", unknown], { help: "Uniquement si vous la connaissez déjà. N’ouvrez aucun coffret électrique." }),
    radio("electrical_state", "Quel fonctionnement avez-vous constaté ?", ["Spa complètement éteint", "Certaines fonctions indisponibles", "Spa allumé malgré le problème", unknown, "Non observable"]),
    text("unavailable_functions", "Quelles fonctions sont indisponibles ?", { showWhen: when("electrical_state", "Certaines fonctions indisponibles") }),
    radio("trip", "Le spa disjoncte-t-il ?", yesNo, { required: true }),
    radio("trip_moment", "À quel moment le spa disjoncte-t-il ?", ["Dès la mise sous tension", "Quand une pompe démarre", "Quand le chauffage démarre", "Aléatoirement", unknown], { showWhen: when("trip", "Oui") }),
    radio("breaker", "Quelle protection déclenche ?", ["Différentiel 30 mA", "Disjoncteur spa", "Général", unknown], { showWhen: when("trip", "Oui") }),
    radio("trip_delay_type", "Le déclenchement déjà observé est-il immédiat ou retardé ?", ["Immédiat", "Après un délai", unknown], { showWhen: when("trip", "Oui") }),
    text("trip_delay", "Délai approximatif avant le déclenchement", { showWhen: when("trip_delay_type", "Après un délai") }),
    radio("burnt_smell", "Une odeur de brûlé a-t-elle déjà été constatée ?"),
  ],
  chauffage: [
    multi("heating_symptoms", "Comment se manifeste le problème de chauffage ?", ["Ne chauffe plus", "Chauffe lentement", "Chauffe puis s’arrête", "N’atteint pas la température demandée", "Atteint la température mais ne la maintient pas", "Eau trop chaude ou température dépassant la consigne"]),
    radio("still_heating", "L’eau chauffe-t-elle encore ?", ["Oui", "Non", "Partiellement", unknown, "Non observable"], { hideWhen: when("heating_symptoms", "Ne chauffe plus", "Chauffe lentement", "Chauffe puis s’arrête") }),
    number("display_temp", "Température affichée (°C)"), number("target_temp", "Température demandée (°C)"),
    text("time_since_refill", "Temps écoulé depuis le remplissage", { showWhenAny: [when("triggering_events", "Remplissage"), when("recent_refill", "Oui")] }),
    radio("heating_mode", "Mode affiché", ["Normal", "Économie", "Veille", "Autre", unknown, "Écran illisible"]),
    text("heating_mode_other", "Quel autre mode est affiché ?", { showWhen: when("heating_mode", "Autre") }),
    radio("heating_system", "Quel chauffage équipe le spa ?", ["Chauffage intégré", "Pompe à chaleur extérieure", "Les deux", unknown]),
    radio("thermometer_available", "Disposez-vous déjà d’une mesure avec un thermomètre indépendant ?"),
    number("thermometer_temp", "Température déjà mesurée au thermomètre (°C)", { showWhen: when("thermometer_available", "Oui") }),
    radio("filtration_ok", "La filtration fonctionne-t-elle ?"), radio("circulation_pump", "La pompe de circulation fonctionne-t-elle ?"),
    radio("trip_on_heat", "Une disjonction au démarrage du chauffage a-t-elle déjà été observée ?"),
  ],
  fuite: [
    radio("visible_leak", "La fuite est-elle visible ?", yesNo, { required: true }), spaAccessQuestion,
    radio("fast_drop", "Le niveau d’eau baisse-t-il rapidement ?"), number("level_drop_cm", "Baisse approximative déjà observée (cm)"),
    text("level_drop_duration", "Sur quelle durée cette baisse a-t-elle été observée ?", { showWhen: { questionId: "level_drop_cm", values: [] } }),
    radio("running_only", "Le spa fuit-il uniquement lorsqu’il fonctionne ?"),
    multi("leak_functions", "Pendant quelles fonctions la fuite a-t-elle été observée ?", ["Massage", "Filtration", "Chauffage", "Autre fonction"], { showWhen: when("running_only", "Oui") }),
    text("stable_water_level", "Niveau auquel la baisse s’est stabilisée, si déjà constaté", { help: "Facultatif. Ne laissez pas volontairement le niveau descendre pour faire un essai." }),
    multi("suspected_area", "Où la fuite semble-t-elle se situer ?", ["Dessous du spa", "Jets", "Pompe", "Réchauffeur", "Raccord", "Vanne", "Filtre", "Vidange", "Canalisation", "Autre"]),
    text("leak_location_detail", "Précisez la zone observée", { showWhen: when("suspected_area", "Autre") }),
  ],
  "clavier-ecran": [
    radio("keyboard_type", "Type de clavier", ["Clavier à touches", "Clavier tactile", unknown]),
    radio("screen_on", "L’écran s’allume-t-il ?"),
    multi("screen_symptoms", "Quel défaut présente l’écran ?", ["Écran noir", "Clignotant", "Figé", "Partiellement lisible", "Affichage incohérent", "Autre"]),
    radio("buttons_work", "Les touches répondent-elles ?", ["Oui", "Non", "Partiellement", unknown, "Non observable"]),
    text("affected_controls", "Quelles touches ou commandes sont concernées ?", { showWhen: when("buttons_work", "Non", "Partiellement") }),
    radio("lock_symbol", "Un symbole de verrouillage est-il visible ?"), radio("screen_restarts", "Des redémarrages spontanés ont-ils été observés ?"),
    radio("screen_damage", "La vitre ou la membrane est-elle visiblement abîmée ?"), radio("humidity", "Présence visible d’humidité dans le clavier ?"),
    text("working_functions", "Quelles fonctions du spa continuent à fonctionner ?"),
  ],
  filtration: [
    multi("filtration_behavior", "Quel fonctionnement de la filtration avez-vous constaté ?", ["Ne démarre jamais", "S’interrompt", "Semble fonctionner en continu", "Autre"]),
    text("filtration_schedule", "Horaires et durée programmés, si connus"),
    text("filter_age", "Âge approximatif du filtre, si connu"), text("filter_replaced_at", "Date approximative du dernier remplacement du filtre"),
    radio("flow_issue", "Débit faible ou absent ?", ["Faible", "Absent", "Normal", unknown, "Non observable"]),
    radio("filter_cleaned", "Le filtre a-t-il été nettoyé récemment ?"),
    radio("water_level_mark", "Niveau d’eau par rapport au repère du spa", ["Sous le repère", "Au repère", "Au-dessus du repère", "Pas de repère visible", unknown, "Non observable"]),
  ],
  "bruit-anormal": [
    multi("noise_types", "Comment décririez-vous le bruit ?", ["Ronronnement", "Grincement", "Claquement", "Sifflement", "Gargouillement", "Autre"]),
    text("noise_location", "Zone d’où semble venir le bruit"), text("noise_equipment", "Équipement concerné, si identifiable"),
    radio("when_noise", "Quand le bruit apparaît-il ?", ["Au démarrage", "En filtration", "En massage", "En chauffage", "En permanence", unknown]),
    radio("vibration", "Une vibration anormale a-t-elle déjà été constatée ?"),
    multi("noise_associated", "Quels autres signes avez-vous observés en même temps ?", ["Débit faible", "Arrêt d’un équipement", "Fuite", "Aucun autre signe"]),
    text("noise_description", "Décrivez le bruit et les précisions utiles", { type: "textarea" }),
  ],
  autre: [
    radio("other_equipment", "Quel équipement est concerné ?", ["Jets", "Commande de répartition", "Soufflerie", "Éclairage", "Ozonateur", "Couverture", "Habillage", "Autre / inconnu"]),
    text("description", "Décrivez le problème constaté", { type: "textarea", required: true, help: "Précisez le symptôme observé et, si vous la connaissez, la fonction concernée." }),
    radio("still_usable", "Le spa est-il encore utilisable ?", ["Oui", "Non", "Partiellement", unknown, "Non observable"], { required: true }),
  ],
  "traitement-eau": [
    radio("water_hue", "Couleur de l’eau", ["Incolore", "Verte", "Brune / jaune", "Blanchâtre", "Autre", unknown, "Non observable"], { section: "Observations de l’eau" }),
    radio("water_clarity", "Transparence de l’eau", ["Transparente", "Trouble", "Opaque", unknown, "Non observable"]),
    radio("water_foam", "De la mousse est-elle présente ?"), radio("water_odor", "Une odeur inhabituelle est-elle présente ?"),
    text("water_odor_detail", "Décrivez l’odeur, si vous l’avez déjà remarquée", { showWhen: when("water_odor", "Oui") }),
    number("water_volume", "Volume approximatif du spa (litres)", { section: "Eau et utilisation" }),
    text("water_renewed_at", "Date du dernier renouvellement de l’eau"), number("water_temperature", "Température de l’eau (°C)"),
    text("recent_bathing", "Fréquentation récente (personnes, fréquence, dernière utilisation)"),
    radio("filter_cleaned", "Le filtre a-t-il été nettoyé récemment ?"),
    number("ph_value", "pH exact, si déjà mesuré", { max: 14, section: "Mesures et produits", help: "Utilisez uniquement une mesure disponible. Une ancienne plage de pH reste indiquée séparément si la valeur exacte est inconnue." }),
    radio("disinfectant", "Désinfectant principal", ["Chlore", "Brome", "Oxygène actif", "Autre", "Aucun", unknown]),
    text("disinfectant_name", "Nom exact du désinfectant, si connu", { showWhen: when("disinfectant", "Chlore", "Brome", "Oxygène actif", "Autre") }),
    text("disinfectant_measure", "Mesure disponible pour ce désinfectant (valeur et unité du relevé)", { showWhen: when("disinfectant", "Chlore", "Brome", "Oxygène actif", "Autre"), help: "Indiquez par exemple la valeur de chlore libre ou de brome déjà mesurée, selon le produit déclaré. N’effectuez aucun mélange." }),
    text("water_measurement_date", "Date du relevé d’analyse, si connue"),
    text("complementary_products", "Produits complémentaires utilisés (noms exacts si connus)", { help: "À distinguer du désinfectant principal. Listez les produits déjà utilisés, sans mélanger de traitements." }),
    text("last_treatment", "Date approximative du dernier traitement"),
    text("recent_products", "Ajouts récents : produit, quantité approximative et date", { type: "textarea" }),
    number("tac_value", "TAC déjà mesuré (mg/L)", { help: "Facultatif. Si votre relevé utilise une autre unité, indiquez-la dans les précisions." }),
    number("th_value", "TH déjà mesuré (°f)", { help: "Facultatif. Si votre relevé utilise une autre unité, indiquez-la dans les précisions." }),
    text("water_details", "Précisions, autres valeurs et unités du relevé", { type: "textarea" }),
    radio("water_color", "Aspect de l’eau (réponse du précédent formulaire)", ["Claire", "Trouble", "Verte", "Moussante", "Odeur forte"], { legacyOnly: true }),
    radio("product_used", "Produit utilisé (réponse du précédent formulaire)", ["Chlore", "Brome", "Oxygène actif", "Aqua finess", "O-care", "Zodiac (mineral)", "Autre"], { legacyOnly: true }),
    radio("ph_level", "Plage de pH précédemment indiquée", ["Moins de 7", "Entre 7 et 7,8", "Plus de 7,8", unknown], { legacyOnly: true }),
  ]
};
export const questionSets = Object.fromEntries(problemTypes.map(({ value }) => {
  const shared = value === "traitement-eau" ? [] : common.map(q => value === "filtration" && q.id === "error_message" ? { ...q, id: "screen_error" } : q);
  return [value, [...shared, ...specific[value].map((q, i) => i === 0 && value !== "traitement-eau" ? { ...q, section: "Observations du problème" } : q)]];
})) as Record<ProblemType, Question[]>;

type PhotoRequirement = { id: string; label: string; required: boolean; problemTypes?: ProblemType[] };
export const photoRequirements: PhotoRequirement[] = [
  { id: "keyboard", label: "Photo du clavier / écran avec le défaut visible", required: false },
  { id: "technical_bay", label: "Vue du compartiment technique, seulement s’il est déjà accessible", required: false },
  { id: "serial_plate", label: "Photo de la plaque signalétique du spa, si accessible", required: false },
  { id: "visible_problem", label: "Photo du problème visible ou de l’équipement concerné", required: false },
  { id: "pump_reference", label: "Étiquette de référence de la pompe, si accessible", required: false, problemTypes: ["pompe"] },
  { id: "leak_overview", label: "Vue d’ensemble de la zone de fuite", required: false, problemTypes: ["fuite"] },
  { id: "filter_reference", label: "Référence du filtre, si visible", required: false, problemTypes: ["filtration"] },
  { id: "water_test", label: "Photo de la bandelette ou du relevé d’analyse", required: false, problemTypes: ["traitement-eau"] },
  { id: "filters", label: "Photo du ou des filtres", required: false, problemTypes: ["traitement-eau", "filtration"] },
  { id: "water_overview", label: "Photo générale du spa en eau", required: false, problemTypes: ["traitement-eau"] },
  { id: "product_labels", label: "Étiquettes des produits déjà utilisés", required: false, problemTypes: ["traitement-eau"] }
];
export function getPhotoRequirements(problemType?: ProblemType | "", existingPhotos: Record<string, string> = {}) {
  // Keep already attached legacy photos available when the suggestions evolve.
  const suggested = photoRequirements.filter(photo => problemType === "traitement-eau" ? photo.problemTypes?.includes(problemType) : !photo.problemTypes || (problemType && photo.problemTypes?.includes(problemType)));
  const selected = problemType === "filtration" ? suggested.filter(photo => photo.id !== "technical_bay") : suggested;
  return [...selected, ...photoRequirements.filter(photo => existingPhotos[photo.id] && !selected.some(p => p.id === photo.id))].map(photo => {
    if (photo.id === "technical_bay" && problemType === "pompe") return { ...photo, label: "Vue de la pompe dans le compartiment technique déjà accessible, sans démontage" };
    if (photo.id === "visible_problem" && problemType === "fuite") return { ...photo, label: "Gros plan de la zone de fuite visible" };
    return photo;
  });
}
export function isPhotoRequired(photoId: string, problemType?: ProblemType | "") {
  return photoId === "keyboard" && problemType === "electrique";
}
export const remotePlans = [
  { id: "water", name: "Diagnostic Traitement d'Eau IA", price: 9, stripeEnv: "STRIPE_PRICE_WATER_ASSISTANT", enabled: true },
  { id: "photo", name: "Assistance téléphonique", price: 49, stripeEnv: "STRIPE_PRICE_DIAGNOSTIC_PHOTO", enabled: false, archived: true },
  { id: "guided", name: "Assistance guidée via photos", price: 89, stripeEnv: "STRIPE_PRICE_ASSISTANCE_GUIDED", enabled: false, archived: true },
  { id: "premium", name: "Assistance vidéo / visio", price: 129, stripeEnv: "STRIPE_PRICE_ASSISTANCE_PREMIUM", enabled: false, archived: true }
] as const;
