import { ProblemType, Question } from "@/lib/types";

export const problemTypes: Array<{ value: ProblemType; label: string }> = [
  { value: "fuite", label: "Fuite / baisse du niveau d’eau" },
  { value: "electrique", label: "Spa éteint / disjonction" },
  { value: "traitement-eau", label: "Traitement d'eau" },
  { value: "pompe", label: "Pompe / jets de massage" },
  { value: "chauffage", label: "Chauffage" },
  { value: "clavier-ecran", label: "Clavier / écran" },
  { value: "filtration", label: "Filtration / circulation de l’eau" },
  { value: "bruit-anormal", label: "Bruit anormal" },
  { value: "autre", label: "Autre problème / je ne sais pas où le classer" },
  { value: "demenagement", label: "Déménagement de mon spa" },
];

export const unknown = "Je ne sais pas";
export const unavailableValues = [
  "Valeur inconnue",
  "Écran illisible",
  "Non observable",
  "Non applicable",
];
const yesNo = ["Oui", "Non", unknown, "Non observable"];
const radio = (
  id: string,
  label: string,
  options = yesNo,
  extra: Partial<Question> = {},
): Question => ({ id, label, type: "radio", options, ...extra });
const multi = (
  id: string,
  label: string,
  options: string[],
  extra: Partial<Question> = {},
): Question => ({
  id,
  label,
  type: "checkbox",
  options: [...options, unknown, "Non observable"],
  ...extra,
});
const text = (
  id: string,
  label: string,
  extra: Partial<Question> = {},
): Question => ({ id, label, type: "text", ...extra });
const number = (
  id: string,
  label: string,
  extra: Partial<Question> = {},
): Question => ({
  id,
  label,
  type: "number",
  unknownOptions: unavailableValues,
  min: 0,
  ...extra,
});
const when = (questionId: string, ...values: string[]) => ({
  questionId,
  values,
});
const events = [
  "Remplissage",
  "Nettoyage",
  "Coupure de courant",
  "Intervention",
  "Gel",
  "Pluie",
  "Orage",
  "Fuite",
  "Remplacement du filtre",
  "Aucun événement identifié",
];
export const spaAccessQuestion = radio(
  "spa_access",
  "Le spa est-il accessible ?",
  [
    "Oui sur les 4 côtés",
    "Non, seulement sur certains côtés",
    "Encastré ou semi-encastré",
    unknown,
  ],
  { help: "Indiquez les accès existants, sans déplacer ni démonter le spa." },
);
export const photoUnavailableQuestion = radio(
  "keyboard_photo_unavailable",
  "Pourquoi ne pouvez-vous pas joindre la photo du clavier ?",
  [
    "Clavier inaccessible sans démontage",
    "Impossible de prendre une photo avec mon appareil",
    "Autre impossibilité",
  ],
  { required: true },
);
export const photoUnavailableDetail = text(
  "keyboard_photo_unavailable_detail",
  "Précisez pourquoi la photo est impossible",
  {
    required: true,
    showWhen: when("keyboard_photo_unavailable", "Autre impossibilité"),
  },
);
export const diagnosticSafety =
  "Décrivez uniquement ce que vous avez déjà observé. Ne démontez rien, ne touchez pas la pompe pour vérifier sa température et ne reproduisez pas une disjonction. Vous pouvez laisser les informations inconnues ou inaccessibles non renseignées.";
const common: Question[] = [
  text("started_when", "Depuis quand avez-vous constaté le problème ?", {
    section: "Historique et message affiché",
    help: "Une date approximative suffit : depuis hier, depuis deux semaines, depuis la remise en eau…",
  }),
  radio("problem_frequency", "Le problème est-il permanent ou intermittent ?", [
    "Permanent",
    "Intermittent",
    unknown,
  ]),
  multi(
    "triggering_events",
    "Après quel événement le problème est-il apparu ?",
    events,
    {
      help: "Plusieurs réponses possibles. Décrivez la chronologie observée, sans en déduire la cause.",
    },
  ),
  text("recent_service_details", "Quelle intervention a été effectuée ?", {
    showWhenAny: [
      when("triggering_events", "Intervention"),
      when("recent_service", "Oui"),
    ],
  }),
  radio(
    "worked_before",
    "Le spa fonctionnait-il normalement avant ce problème ?",
    [
      "Oui",
      "Non, depuis l’installation / l’achat",
      "Je viens de récupérer ce spa",
      unknown,
    ],
  ),
  text("actions_tried", "Actions déjà essayées et résultat obtenu", {
    type: "textarea",
    help: "Facultatif : relatez les essais passés, sans en effectuer de nouveaux pour ce formulaire.",
  }),
  radio("has_error", "Un code ou message d’erreur est-il affiché ?", [
    "Oui",
    "Non",
    "Écran éteint",
    "Écran illisible",
    "Code inconnu",
    unknown,
  ]),
  text("error_message", "Code ou message affiché (si lisible)", {
    showWhen: { ...when("has_error", "Oui"), legacyWhenUnanswered: true },
  }),
  radio("recent_refill", "Remise en eau récente (réponse précédente)", yesNo, {
    legacyOnly: true,
  }),
  radio("recent_service", "Intervention récente (réponse précédente)", yesNo, {
    legacyOnly: true,
  }),
  radio("recent_freeze", "Gel récent (réponse précédente)", yesNo, {
    legacyOnly: true,
  }),
];
export const pumpSymptoms = {
  silent: "Ne démarre pas et ne fait aucun bruit",
  hum: "Ronronne mais ne semble pas démarrer",
  flow: "Débit faible ou absent",
  noise: "Bruit inhabituel",
  immediateTrip: "Disjonction au démarrage de la pompe",
  delayedTrip: "Disjonction après quelques minutes",
  stop: "S’arrête seule après quelques minutes",
  leak: "Fuite visible au niveau de la pompe",
  heat: "Échauffement inhabituel déjà constaté",
  smell: "Odeur de brûlé déjà constatée",
  speed: "Une seule vitesse fonctionne (si plusieurs vitesses existent)",
  other: "Autre symptôme",
};
const specific: Record<ProblemType, Question[]> = {
  demenagement: [
    text("moving_departure", "Adresse d’enlèvement du spa : numéro et rue", { required: true, section: "Les adresses de votre déménagement" }),
    text("moving_destination", "Adresse de livraison complète : numéro, rue, code postal et ville", { required: true }),
    text("moving_date", "Date ou période souhaitée pour le déménagement", { required: true }),
    number("moving_places", "Nombre de places du spa", { min: 1, max: 50, integer: true, unknownOptions: ["Valeur inconnue"], section: "Le spa à transporter", help: "Nombre de places assises et allongées, si connu." }),
    text("moving_dimensions", "Dimensions du spa : longueur × largeur × hauteur", { required: true, help: "Précisez les unités. Si vous ne les connaissez pas, indiquez-le ; ne déplacez pas le spa pour mesurer." }),
    number("moving_weight", "Poids à vide du spa (kg)", { min: 1, max: 100000, unknownOptions: ["Valeur inconnue"], help: "Recopiez le poids à vide de la notice, sans l’estimer. Si vous ne le connaissez pas, choisissez « Valeur inconnue »." }),
    radio("moving_departure_obstacles", "Y a-t-il des obstacles à l’enlèvement ?", ["Oui", "Non", unknown], { section: "Les accès au départ" }),
    radio("moving_departure_access", "Accès au spa au départ", ["Accès de plain-pied", "Marches ou escalier", "Terrasse ou étage", "Spa encastré / semi-encastré", unknown], { required: true }),
    text("moving_departure_details", "Décrivez le passage au départ : largeur et hauteur du passage, portail, marches, arbres, distance au véhicule", { type: "textarea", required: true }),
    radio("moving_destination_obstacles", "Y a-t-il des obstacles à la livraison ?", ["Oui", "Non", unknown], { section: "Les accès à l’arrivée" }),
    radio("moving_destination_access", "Accès à l’emplacement d’arrivée", ["Accès de plain-pied", "Marches ou escalier", "Terrasse ou étage", "Spa à encastrer", unknown], { required: true }),
    text("moving_destination_details", "Décrivez le passage à l’arrivée : largeur et hauteur du passage, portail, marches, arbres, distance au véhicule", { type: "textarea", required: true }),
    radio("moving_lifting", "Faut-il prévoir un engin de levage (grue, camion-grue…) ?", ["Oui, au départ", "Oui, à l’arrivée", "Oui, aux deux adresses", "Non, a priori", unknown], { section: "Les moyens à prévoir", help: "Le professionnel confirmera les moyens adaptés. Ne tentez pas de déplacer le spa vous-même." }),
    radio("moving_disconnection", "Faut-il prévoir la vidange et la déconnexion du spa ?", ["Oui", "Non, elles seront réalisées avant", unknown]),
    text("moving_details", "Autres précisions utiles pour le transport", { type: "textarea" }),
  ],
  pompe: [
    radio("pump_type", "Quelle pompe semble concernée ?", [
      "Pompe de massage",
      "Pompe de circulation / filtration",
      "Plusieurs pompes",
      unknown,
    ]),
    multi(
      "pump_symptoms",
      "Que constatez-vous sur la pompe ou les jets ?",
      Object.values(pumpSymptoms),
      {
        exclusiveGroups: [
          [pumpSymptoms.silent, pumpSymptoms.hum],
          [pumpSymptoms.silent, pumpSymptoms.noise],
          [pumpSymptoms.silent, pumpSymptoms.stop],
          [pumpSymptoms.immediateTrip, pumpSymptoms.delayedTrip],
        ],
        help: "Si vous ne savez pas quelle pompe est concernée, décrivez simplement les jets qui ne fonctionnent plus.",
      },
    ),
    radio(
      "pump_starts",
      "La pompe démarre-t-elle ?",
      ["Oui", "Non", "Par intermittence", unknown, "Non observable"],
      {
        hideWhen: when("pump_symptoms", pumpSymptoms.silent, pumpSymptoms.hum),
      },
    ),
    radio(
      "pump_noise",
      "Lorsqu’elle fonctionne, émet-elle un bruit inhabituel ?",
      yesNo,
      {
        hideWhenAny: [
          when(
            "pump_symptoms",
            pumpSymptoms.noise,
            pumpSymptoms.hum,
            pumpSymptoms.silent,
          ),
          when("pump_starts", "Non"),
        ],
      },
    ),
    radio(
      "flow_ok",
      "Lorsque la pompe tourne, le débit aux jets semble-t-il normal ?",
      yesNo,
      {
        hideWhenAny: [
          when(
            "pump_symptoms",
            pumpSymptoms.flow,
            pumpSymptoms.silent,
            pumpSymptoms.hum,
          ),
          when("pump_starts", "Non"),
        ],
      },
    ),
    radio("pump_jets_affected", "Quels jets sont concernés ?", [
      "Tous les jets de massage",
      "Un groupe de jets",
      "Un seul jet",
      "Seulement le retour de filtration",
      unknown,
    ]),
    text("pump_trip_detail", "Quand la disjonction a-t-elle été observée ?", {
      showWhen: when(
        "pump_symptoms",
        pumpSymptoms.immediateTrip,
        pumpSymptoms.delayedTrip,
      ),
      help: "Décrivez uniquement ce qui s’est déjà produit, sans remettre en marche.",
    }),
    text("pump_leak_detail", "Où l’eau apparaît-elle autour de la pompe ?", {
      showWhen: when("pump_symptoms", pumpSymptoms.leak),
      help: "Seulement si la zone est déjà visible, sans retirer de panneau.",
    }),
    text(
      "pump_stop_delay",
      "Après combien de temps la pompe s’arrête-t-elle environ ?",
      { showWhen: when("pump_symptoms", pumpSymptoms.stop) },
    ),
    radio(
      "pump_restart_observed",
      "Un redémarrage ultérieur a-t-il déjà été observé ?",
      yesNo,
      { showWhen: when("pump_symptoms", pumpSymptoms.stop) },
    ),
    text("pump_details", "Précisions utiles sur les symptômes", {
      type: "textarea",
    }),
  ],
  electrique: [
    radio(
      "power_supply_known",
      "Quel type d’alimentation connaissez-vous pour ce spa ?",
      ["230V", "400V", unknown],
      {
        help: "Uniquement si vous la connaissez déjà. N’ouvrez aucun coffret électrique.",
      },
    ),
    radio("electrical_state", "Quel fonctionnement avez-vous constaté ?", [
      "Spa complètement éteint",
      "Certaines fonctions indisponibles",
      "Spa allumé malgré le problème",
      unknown,
      "Non observable",
    ]),
    text("unavailable_functions", "Quelles fonctions sont indisponibles ?", {
      showWhen: when("electrical_state", "Certaines fonctions indisponibles"),
    }),
    radio("trip", "Le spa disjoncte-t-il ?", yesNo, { required: true }),
    radio(
      "trip_moment",
      "À quel moment le spa disjoncte-t-il ?",
      [
        "Dès la mise sous tension",
        "Quand une pompe démarre",
        "Quand le chauffage démarre",
        "Aléatoirement",
        unknown,
      ],
      { showWhen: when("trip", "Oui") },
    ),
    radio(
      "breaker",
      "Quelle protection déclenche ?",
      ["Différentiel 30 mA", "Disjoncteur spa", "Général", unknown],
      { showWhen: when("trip", "Oui") },
    ),
    radio(
      "trip_delay_type",
      "Le déclenchement déjà observé est-il immédiat ou retardé ?",
      ["Immédiat", "Après un délai", unknown],
      { showWhen: when("trip", "Oui") },
    ),
    text("trip_delay", "Délai approximatif avant le déclenchement", {
      showWhen: when("trip_delay_type", "Après un délai"),
    }),
    radio(
      "other_power",
      "Lors de la panne, le reste du logement avait-il du courant ?",
    ),
    radio("burnt_smell", "Une odeur de brûlé a-t-elle déjà été constatée ?"),
  ],
  chauffage: [
    multi(
      "heating_symptoms",
      "Comment se manifeste le problème de chauffage ?",
      [
        "Ne chauffe plus",
        "Chauffe lentement",
        "Chauffe puis s’arrête",
        "N’atteint pas la température demandée",
        "Atteint la température mais ne la maintient pas",
        "Eau trop chaude ou température dépassant la consigne",
      ],
      {
        exclusiveGroups: [
          ["Ne chauffe plus", "Chauffe lentement"],
          ["Ne chauffe plus", "Chauffe puis s’arrête"],
          [
            "Ne chauffe plus",
            "Atteint la température mais ne la maintient pas",
          ],
          ...[
            "Ne chauffe plus",
            "Chauffe lentement",
            "Chauffe puis s’arrête",
            "N’atteint pas la température demandée",
            "Atteint la température mais ne la maintient pas",
          ].map((symptom) => [
            "Eau trop chaude ou température dépassant la consigne",
            symptom,
          ]),
        ],
        help: "Plusieurs signes peuvent être associés s’ils ont été observés ensemble. Aucun nouvel essai n’est nécessaire.",
      },
    ),
    radio(
      "still_heating",
      "L’eau chauffe-t-elle encore ? (réponse précédente)",
      ["Oui", "Non", "Partiellement", unknown, "Non observable"],
      {
        legacyOnly: true,
        hideWhen: when(
          "heating_symptoms",
          "Ne chauffe plus",
          "Chauffe lentement",
          "Chauffe puis s’arrête",
        ),
      },
    ),
    number("display_temp", "Température affichée (°C)", { max: 100 }),
    number("target_temp", "Température demandée sur le clavier (°C)", {
      max: 45,
    }),
    text("time_since_refill", "Temps écoulé depuis le remplissage", {
      showWhenAny: [
        when("triggering_events", "Remplissage"),
        when("recent_refill", "Oui"),
      ],
    }),
    radio("heating_mode", "Mode affiché", [
      "Normal",
      "Économie",
      "Veille",
      "Autre",
      unknown,
      "Écran illisible",
    ]),
    text("heating_mode_other", "Quel autre mode est affiché ?", {
      showWhen: when("heating_mode", "Autre"),
    }),
    radio("heating_system", "Quel chauffage équipe le spa ?", [
      "Chauffage intégré",
      "Pompe à chaleur extérieure",
      "Les deux",
      unknown,
    ]),
    radio(
      "thermometer_available",
      "Disposez-vous déjà d’une mesure avec un thermomètre indépendant ?",
    ),
    number("thermometer_temp", "Température déjà mesurée au thermomètre (°C)", {
      showWhen: when("thermometer_available", "Oui"),
    }),
    text(
      "heating_duration",
      "Depuis combien de temps la température n’évolue-t-elle plus ou évolue-t-elle trop lentement ?",
      {
        hideWhen: when(
          "heating_symptoms",
          "Eau trop chaude ou température dépassant la consigne",
        ),
      },
    ),
    radio(
      "cover_in_place",
      "La couverture était-elle en place pendant la chauffe observée ?",
    ),
    text(
      "outside_temperature",
      "Température extérieure approximative lors du problème, si connue",
    ),
    radio(
      "filtration_ok",
      "L’eau semble-t-elle circuler pendant la filtration ?",
      yesNo,
      {
        help: "D’après les mouvements d’eau déjà observés, sans toucher aux équipements.",
      },
    ),
    radio(
      "circulation_pump",
      "Pompe de circulation (réponse précédente)",
      yesNo,
      { legacyOnly: true },
    ),
    radio(
      "trip_on_heat",
      "Une disjonction au démarrage du chauffage a-t-elle déjà été observée ?",
    ),
  ],
  fuite: [
    radio("visible_leak", "La fuite est-elle visible ?", yesNo, {
      required: true,
    }),
    spaAccessQuestion,
    radio(
      "leak_water_outside",
      "Avez-vous constaté de l’eau à l’extérieur du spa ?",
    ),
    radio("fast_drop", "Baisse rapide du niveau (réponse précédente)", yesNo, {
      legacyOnly: true,
    }),
    number("level_drop_cm", "Baisse approximative déjà observée (cm)"),
    text(
      "level_drop_duration",
      "Sur quelle durée cette baisse a-t-elle été observée ?",
      { showWhen: { questionId: "level_drop_cm", values: [] } },
    ),
    radio(
      "running_only",
      "La fuite apparaît-elle uniquement pendant le fonctionnement ?",
      yesNo,
      {
        help: "Répondez d’après les observations passées. Ne démarrez pas le spa pour comparer.",
      },
    ),
    multi(
      "leak_functions",
      "Pendant quelles fonctions la fuite a-t-elle été observée ?",
      ["Massage", "Filtration", "Chauffage", "Autre fonction"],
      { showWhen: when("running_only", "Oui") },
    ),
    radio(
      "leak_at_rest",
      "La baisse de niveau a-t-elle aussi été constatée à l’arrêt ?",
      yesNo,
      { hideWhen: when("running_only", "Oui", "Non") },
    ),
    text(
      "stable_water_level",
      "Niveau auquel la baisse s’est stabilisée, si déjà constaté",
      {
        help: "Facultatif. Ne laissez pas volontairement le niveau descendre pour faire un essai.",
      },
    ),
    multi(
      "suspected_area",
      "Où la fuite semble-t-elle se situer ?",
      [
        "Dessous du spa",
        "Jets",
        "Pompe",
        "Réchauffeur",
        "Raccord",
        "Vanne",
        "Filtre",
        "Vidange",
        "Canalisation",
        "Autre",
      ],
      {
        showWhen: when("visible_leak", "Oui"),
        help: "Choisissez uniquement une zone visible, sans démontage.",
      },
    ),
    text("leak_location_detail", "Précisez la zone observée", {
      showWhen: when("suspected_area", "Autre"),
    }),
  ],
  "clavier-ecran": [
    radio("keyboard_type", "Type de clavier", [
      "Clavier à touches",
      "Clavier tactile",
      unknown,
    ]),
    radio("screen_on", "L’écran est-il allumé lors du problème ?"),
    multi(
      "screen_symptoms",
      "Quel défaut présente l’écran allumé ?",
      [
        "Clignotant",
        "Figé",
        "Partiellement lisible",
        "Affichage incohérent",
        "Autre",
        "Affichage normal",
      ],
      {
        hideWhen: when("screen_on", "Non"),
        exclusiveGroups: [
          "Écran noir",
          "Clignotant",
          "Figé",
          "Partiellement lisible",
          "Affichage incohérent",
          "Autre",
        ].map((symptom) => ["Affichage normal", symptom]),
      },
    ),
    radio(
      "buttons_work",
      "Les commandes répondent-elles ?",
      ["Oui", "Non", "Partiellement", unknown, "Non observable"],
      { hideWhen: when("screen_on", "Non") },
    ),
    text(
      "affected_controls",
      "Quelles touches ou commandes sont concernées ?",
      { showWhen: when("buttons_work", "Non", "Partiellement") },
    ),
    radio(
      "lock_symbol",
      "Un cadenas ou un message de verrouillage est-il visible ?",
      yesNo,
      { hideWhen: when("screen_on", "Non") },
    ),
    radio(
      "screen_restarts",
      "Des redémarrages spontanés ont-ils été observés ?",
      yesNo,
      { hideWhen: when("screen_on", "Non") },
    ),
    radio(
      "screen_damage",
      "La vitre ou la membrane est-elle visiblement abîmée ?",
    ),
    radio("humidity", "Présence visible d’humidité dans le clavier ?"),
    text(
      "working_functions",
      "Quelles fonctions du spa continuent à fonctionner ?",
    ),
  ],
  filtration: [
    multi(
      "filtration_behavior",
      "Quel problème de filtration avez-vous constaté ?",
      [
        "Ne démarre jamais",
        "S’interrompt",
        "Semble fonctionner en continu",
        "Débit faible malgré le fonctionnement",
        "Autre",
      ],
      {
        exclusiveGroups: [
          ["Ne démarre jamais", "S’interrompt"],
          ["Ne démarre jamais", "Semble fonctionner en continu"],
          ["Ne démarre jamais", "Débit faible malgré le fonctionnement"],
          ["S’interrompt", "Semble fonctionner en continu"],
        ],
      },
    ),
    text("filtration_schedule", "Horaires et durée programmés, si connus"),
    text("filter_age", "Âge du filtre (réponse précédente)", {
      legacyOnly: true,
    }),
    text(
      "filter_replaced_at",
      "Quand le filtre a-t-il été remplacé pour la dernière fois, si connu ?",
    ),
    radio(
      "flow_issue",
      "Pendant la filtration, quel mouvement d’eau avez-vous observé ?",
      ["Faible", "Absent", "Normal", unknown, "Non observable"],
      {
        hideWhen: when(
          "filtration_behavior",
          "Ne démarre jamais",
          "Débit faible malgré le fonctionnement",
        ),
      },
    ),
    radio("filter_cleaned", "Le filtre a-t-il été nettoyé récemment ?"),
    text(
      "filter_cleaned_at",
      "Quand et comment le filtre a-t-il été nettoyé ?",
      { showWhen: when("filter_cleaned", "Oui") },
    ),
    radio("water_level_mark", "Niveau d’eau par rapport au repère du spa", [
      "Sous le repère",
      "Au repère",
      "Au-dessus du repère",
      "Pas de repère visible",
      unknown,
      "Non observable",
    ]),
  ],
  "bruit-anormal": [
    multi("noise_types", "Comment décririez-vous le bruit ?", [
      "Ronronnement",
      "Grincement",
      "Claquement",
      "Sifflement",
      "Gargouillement",
      "Autre",
    ]),
    text("noise_location", "Zone d’où semble venir le bruit"),
    text("noise_equipment", "Équipement concerné, si identifiable"),
    radio("when_noise", "Quand le bruit apparaît-il ?", [
      "Au démarrage",
      "En filtration",
      "En massage",
      "En chauffage",
      "En permanence",
      unknown,
    ]),
    radio("vibration", "Une vibration anormale a-t-elle déjà été constatée ?"),
    multi(
      "noise_associated",
      "Quels autres signes avez-vous observés en même temps ?",
      ["Débit faible", "Arrêt d’un équipement", "Fuite", "Aucun autre signe"],
    ),
    text(
      "noise_duration",
      "Le bruit dure-t-il quelques secondes ou pendant tout le fonctionnement ?",
    ),
    text("noise_other", "Précisez le type de bruit", {
      showWhen: when("noise_types", "Autre"),
    }),
    text("noise_description", "Décrivez le bruit et les précisions utiles", {
      type: "textarea",
    }),
  ],
  autre: [
    radio("other_equipment", "Quel équipement est concerné ?", [
      "Jets",
      "Commande de répartition",
      "Soufflerie",
      "Éclairage",
      "Ozonateur",
      "Couverture",
      "Habillage",
      "Autre / inconnu",
    ]),
    text("description", "Décrivez le problème constaté", {
      type: "textarea",
      required: true,
      help: "Précisez le symptôme observé et, si vous la connaissez, la fonction concernée.",
    }),
    text(
      "other_expected",
      "Que devrait faire cet équipement et que fait-il à la place ?",
      {
        type: "textarea",
        help: "Exemple : les jets d’un côté ne fonctionnent plus, les autres fonctionnent normalement.",
      },
    ),
    radio(
      "still_usable",
      "Le spa est-il encore utilisable ?",
      ["Oui", "Non", "Partiellement", unknown, "Non observable"],
      { required: true },
    ),
  ],
  "traitement-eau": [
    radio(
      "water_hue",
      "Couleur de l’eau",
      [
        "Incolore",
        "Verte",
        "Brune / jaune",
        "Blanchâtre",
        "Autre",
        unknown,
        "Non observable",
      ],
      { section: "Observations de l’eau" },
    ),
    radio("water_clarity", "Transparence de l’eau", [
      "Transparente",
      "Trouble",
      "Opaque",
      unknown,
      "Non observable",
    ]),
    radio("water_foam", "De la mousse est-elle présente ?"),
    radio("water_odor", "Une odeur inhabituelle est-elle présente ?"),
    text(
      "water_odor_detail",
      "Décrivez l’odeur, si vous l’avez déjà remarquée",
      { showWhen: when("water_odor", "Oui") },
    ),
    number("water_volume", "Volume approximatif du spa (litres)", {
      section: "Eau et utilisation",
    }),
    text("water_renewed_at", "Date du dernier renouvellement de l’eau"),
    number("water_temperature", "Température de l’eau (°C)", { max: 100 }),
    text(
      "recent_bathing",
      "Fréquentation récente (personnes, fréquence, dernière utilisation)",
    ),
    radio("filter_cleaned", "Le filtre a-t-il été nettoyé récemment ?"),
    number("ph_value", "pH exact, si déjà mesuré", {
      max: 14,
      section: "Mesures et produits",
      help: "Utilisez uniquement une mesure disponible. Une ancienne plage de pH reste indiquée séparément si la valeur exacte est inconnue.",
    }),
    radio("disinfectant", "Désinfectant principal", [
      "Chlore",
      "Brome",
      "Oxygène actif",
      "Autre",
      "Aucun",
      unknown,
    ]),
    text("disinfectant_name", "Nom exact du désinfectant, si connu", {
      showWhen: when(
        "disinfectant",
        "Chlore",
        "Brome",
        "Oxygène actif",
        "Autre",
      ),
    }),
    text(
      "disinfectant_measure",
      "Mesure disponible pour ce désinfectant (valeur et unité du relevé)",
      {
        showWhen: when(
          "disinfectant",
          "Chlore",
          "Brome",
          "Oxygène actif",
          "Autre",
        ),
        help: "Indiquez par exemple la valeur de chlore libre ou de brome déjà mesurée, selon le produit déclaré. N’effectuez aucun mélange.",
      },
    ),
    radio("water_test_method", "Comment les valeurs ont-elles été mesurées ?", [
      "Bandelette",
      "Test à gouttes",
      "Appareil électronique",
      "Analyse par un professionnel",
      "Aucune mesure disponible",
      unknown,
    ]),
    text("water_measurement_date", "Date du relevé d’analyse, si connue"),
    text(
      "complementary_products",
      "Produits complémentaires utilisés (noms exacts si connus)",
      {
        help: "À distinguer du désinfectant principal. Listez les produits déjà utilisés, sans mélanger de traitements.",
      },
    ),
    text("last_treatment", "Date approximative du dernier traitement"),
    text(
      "recent_products",
      "Ajouts récents : produit, quantité approximative et date",
      { type: "textarea" },
    ),
    number("tac_value", "TAC déjà mesuré (mg/L)", {
      help: "Facultatif. Si votre relevé utilise une autre unité, indiquez-la dans les précisions.",
    }),
    number("th_value", "TH déjà mesuré (°f)", {
      help: "Facultatif. Si votre relevé utilise une autre unité, indiquez-la dans les précisions.",
    }),
    text("water_details", "Précisions, autres valeurs et unités du relevé", {
      type: "textarea",
    }),
    radio(
      "water_color",
      "Aspect de l’eau (réponse du précédent formulaire)",
      ["Claire", "Trouble", "Verte", "Moussante", "Odeur forte"],
      { legacyOnly: true },
    ),
    radio(
      "product_used",
      "Produit utilisé (réponse du précédent formulaire)",
      [
        "Chlore",
        "Brome",
        "Oxygène actif",
        "Aqua finess",
        "O-care",
        "Zodiac (mineral)",
        "Autre",
      ],
      { legacyOnly: true },
    ),
    radio(
      "ph_level",
      "Plage de pH précédemment indiquée",
      ["Moins de 7", "Entre 7 et 7,8", "Plus de 7,8", unknown],
      { legacyOnly: true },
    ),
  ],
};
const contextLabels: Record<ProblemType, { since: string; events: string[] }> =
  {
    demenagement: { since: "", events: [] },
    fuite: {
      since:
        "Depuis quand avez-vous constaté la fuite ou la baisse du niveau d’eau ?",
      events: [
        "Remplissage",
        "Nettoyage",
        "Intervention",
        "Gel",
        "Aucun événement identifié",
      ],
    },
    pompe: {
      since: "Depuis quand la pompe ou les jets présentent-ils ce défaut ?",
      events: [
        "Remplissage",
        "Nettoyage",
        "Coupure de courant",
        "Intervention",
        "Gel",
        "Remplacement du filtre",
        "Aucun événement identifié",
      ],
    },
    chauffage: {
      since: "Depuis quand la température de l’eau pose-t-elle problème ?",
      events: [
        "Remplissage",
        "Coupure de courant",
        "Intervention",
        "Gel",
        "Remplacement du filtre",
        "Aucun événement identifié",
      ],
    },
    electrique: {
      since: "Depuis quand le spa est-il éteint ou disjoncte-t-il ?",
      events: [
        "Remplissage",
        "Coupure de courant",
        "Intervention",
        "Pluie",
        "Orage",
        "Fuite",
        "Aucun événement identifié",
      ],
    },
    "clavier-ecran": {
      since:
        "Depuis quand l’affichage ou les commandes présentent-ils ce défaut ?",
      events: [
        "Nettoyage",
        "Coupure de courant",
        "Intervention",
        "Pluie",
        "Orage",
        "Aucun événement identifié",
      ],
    },
    filtration: {
      since: "Depuis quand avez-vous constaté ce défaut de filtration ?",
      events: [
        "Remplissage",
        "Nettoyage",
        "Coupure de courant",
        "Intervention",
        "Remplacement du filtre",
        "Aucun événement identifié",
      ],
    },
    "bruit-anormal": {
      since: "Depuis quand entendez-vous ce bruit inhabituel ?",
      events: [
        "Remplissage",
        "Nettoyage",
        "Intervention",
        "Remplacement du filtre",
        "Aucun événement identifié",
      ],
    },
    autre: {
      since: "Depuis quand constatez-vous ce défaut sur cet équipement ?",
      events: [
        "Nettoyage",
        "Coupure de courant",
        "Intervention",
        "Gel",
        "Pluie",
        "Orage",
        "Aucun événement identifié",
      ],
    },
    "traitement-eau": {
      since: "Depuis quand l’eau présente-t-elle ce problème ?",
      events: [],
    },
  };
const additionalIssue: Question[] = [
  {
    id: "additional_issue",
    label: "Autre panne à déclarer",
    type: "checkbox",
    options: ["Oui, j’ai une autre panne à signaler"],
    section: "Une autre panne ?",
  },
  text("additional_issue_details", "Décrivez cette autre panne", {
    type: "textarea",
    required: true,
    showWhen: when("additional_issue", "Oui, j’ai une autre panne à signaler"),
    help: "Indiquez le symptôme et l’équipement concerné. Cette précision sera transmise séparément du problème principal.",
  }),
];
export const questionSets = Object.fromEntries(
  problemTypes.map(({ value }) => {
    const shared =
      ["traitement-eau", "demenagement"].includes(value)
        ? []
        : common.map((q) => {
            let question =
              value === "filtration" && q.id === "error_message"
                ? { ...q, id: "screen_error" }
                : { ...q };
            if (q.id === "started_when")
              question = {
                ...question,
                label: contextLabels[value].since,
                section: "Quand cela a-t-il commencé ?",
              };
            if (q.id === "triggering_events")
              question = {
                ...question,
                label:
                  "Dans quelles circonstances avez-vous remarqué ce défaut ?",
                options: [
                  ...contextLabels[value].events,
                  unknown,
                  "Non observable",
                ],
                legacyOptions: events,
              };
            if (value === "fuite") {
              if (q.id === "problem_frequency")
                question = {
                  ...question,
                  label:
                    "La fuite est-elle continue ou apparaît-elle seulement à certains moments ?",
                };
              if (q.id === "actions_tried")
                question = {
                  ...question,
                  label:
                    "Qu’avez-vous déjà fait face à cette fuite, et avec quel résultat ?",
                };
              if (
                ["has_error", "error_message", "worked_before"].includes(q.id)
              )
                question = { ...question, legacyOnly: true };
            }
            if (
              ["bruit-anormal", "autre"].includes(value) &&
              ["has_error", "error_message"].includes(q.id)
            )
              question = { ...question, legacyOnly: true };
            if (q.id === "has_error" && value === "clavier-ecran")
              question = { ...question, hideWhen: when("screen_on", "Non") };
            if (q.id === "has_error" && value === "electrique")
              question = {
                ...question,
                hideWhen: when("electrical_state", "Spa complètement éteint"),
              };
            return question;
          });
    return [
      value,
      [
        ...specific[value].map((q, i) =>
          i === 0 && value !== "traitement-eau"
            ? { ...q, section: "Ce que vous constatez" }
            : q,
        ),
        ...shared,
        ...(value === "demenagement" ? [] : additionalIssue),
      ],
    ];
  }),
) as Record<ProblemType, Question[]>;

type PhotoRequirement = {
  id: string;
  label: string;
  required: boolean;
  problemTypes?: ProblemType[];
};
export const photoRequirements: PhotoRequirement[] = [
  { id: "moving_spa", label: "Vue d’ensemble du spa à déplacer", required: false, problemTypes: ["demenagement"] },
  { id: "moving_departure", label: "Passage et accès au départ", required: false, problemTypes: ["demenagement"] },
  { id: "moving_arrival", label: "Passage et emplacement à l’arrivée", required: false, problemTypes: ["demenagement"] },
  {
    id: "keyboard",
    label: "Photo du clavier / écran avec le défaut visible",
    required: false,
    problemTypes: [
      "electrique",
      "clavier-ecran",
      "chauffage",
      "pompe",
      "filtration",
    ],
  },
  {
    id: "technical_bay",
    label: "Vue du compartiment technique, seulement s’il est déjà accessible",
    required: false,
  },
  {
    id: "serial_plate",
    label: "Photo de la plaque signalétique du spa, si accessible",
    required: false,
  },
  {
    id: "visible_problem",
    label: "Photo du problème visible ou de l’équipement concerné",
    required: false,
  },
  {
    id: "pump_reference",
    label: "Étiquette de référence de la pompe, si accessible",
    required: false,
    problemTypes: ["pompe"],
  },
  {
    id: "leak_overview",
    label: "Vue d’ensemble de la zone de fuite",
    required: false,
    problemTypes: ["fuite"],
  },
  {
    id: "filter_reference",
    label: "Référence du filtre, si visible",
    required: false,
    problemTypes: ["filtration"],
  },
  {
    id: "water_test",
    label: "Photo de la bandelette ou du relevé d’analyse",
    required: false,
    problemTypes: ["traitement-eau"],
  },
  {
    id: "filters",
    label: "Photo du ou des filtres, seulement s’ils sont déjà accessibles",
    required: false,
    problemTypes: ["traitement-eau", "filtration"],
  },
  {
    id: "water_overview",
    label: "Photo générale du spa en eau",
    required: false,
    problemTypes: ["traitement-eau"],
  },
  {
    id: "product_labels",
    label: "Étiquettes des produits déjà utilisés",
    required: false,
    problemTypes: ["traitement-eau"],
  },
];
export function getPhotoRequirements(
  problemType?: ProblemType | "",
  existingPhotos: Record<string, string> = {},
) {
  // Keep already attached legacy photos available when the suggestions evolve.
  const suggested = photoRequirements.filter((photo) =>
    problemType === "traitement-eau" || problemType === "demenagement"
      ? photo.problemTypes?.includes(problemType)
      : !photo.problemTypes ||
        (problemType && photo.problemTypes?.includes(problemType)),
  );
  const selected =
    problemType === "filtration"
      ? suggested.filter((photo) => photo.id !== "technical_bay")
      : suggested;
  return [
    ...selected,
    ...photoRequirements.filter(
      (photo) =>
        existingPhotos[photo.id] && !selected.some((p) => p.id === photo.id),
    ),
  ].map((photo) => {
    if (photo.id === "technical_bay" && problemType === "pompe")
      return {
        ...photo,
        label:
          "Vue de la pompe dans le compartiment technique déjà accessible, sans démontage",
      };
    if (photo.id === "visible_problem" && problemType === "fuite")
      return { ...photo, label: "Gros plan de la zone de fuite visible" };
    return photo;
  });
}
export function isPhotoRequired(
  photoId: string,
  problemType?: ProblemType | "",
) {
  return photoId === "keyboard" && problemType === "electrique";
}
export const remotePlans = [
  {
    id: "water",
    name: "SANISPA Premium — assistance IA",
    price: 9.99,
    stripeEnv: "STRIPE_PRICE_WATER_ASSISTANT",
    enabled: true,
  },
  {
    id: "photo",
    name: "Assistance téléphonique",
    price: 49,
    stripeEnv: "STRIPE_PRICE_DIAGNOSTIC_PHOTO",
    enabled: false,
    archived: true,
  },
  {
    id: "guided",
    name: "Assistance guidée via photos",
    price: 89,
    stripeEnv: "STRIPE_PRICE_ASSISTANCE_GUIDED",
    enabled: false,
    archived: true,
  },
  {
    id: "premium",
    name: "Assistance vidéo / visio",
    price: 129,
    stripeEnv: "STRIPE_PRICE_ASSISTANCE_PREMIUM",
    enabled: false,
    archived: true,
  },
] as const;
