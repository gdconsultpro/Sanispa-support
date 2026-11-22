export const waterDiagnosisGuidance = `Pour juger un pH, utilise la plage de l’étiquette ou de la notice du système en place. Un pH de 7,6 n’est pas automatiquement trop élevé pour un spa au brome. Ne recommande pas de pH moins sur cette seule mesure.
Si le brome mesuré est à zéro malgré des galets, vérifie la fiabilité du test et demande depuis quand les galets sont en place et si l’eau a été renouvelée. Demande si un brome choc, un oxydant compatible ou un activateur a déjà été utilisé, et lequel, uniquement si cette information manque. Les galets diffusent souvent lentement. La mise en route et l’activation dépendent du produit exact. Le nombre ou le poids des galets ne permet pas de calculer le brome actif mesuré.
Si la mesure du désinfectant est à zéro, conseille d’éviter la baignade jusqu’à une mesure conforme à l’étiquette. Ne prescris ni traitement choc ni ajout de produit sans vérifier la compatibilité. Distingue un produit de démarrage, un oxydant et des galets d’entretien.`;

const zeroBromine = /\bbrome(?:\s+(?:mesur[ée]|total|libre|actif|est|reste|toujours|à|a|de|indique|affiche)){0,6}\s*[:=]?\s*(?:0(?:[.,]0+)?|z[ée]ro)(?![\d]|[.,]\d)/i;
const phAtSevenSix = /\bpH(?:\s+(?:est|à|a|de|mesur[ée])){0,4}\s*[:=]?\s*7[.,]60*(?![\d]|[.,]\d)/i;
const activation = /\b(?:choc|activateur|oxydant|bromure)\b/i;

export function initialZeroBromineAnswer(message: string, previousMessages: string[]) {
  if (!zeroBromine.test(message) || [message, ...previousMessages].some(text => activation.test(text))) return null;
  const ph = phAtSevenSix.test(message)
    ? "Un pH de 7,6 peut être dans la plage prévue pour un spa au brome. Vérifiez la plage sur l’étiquette avant toute correction du pH.\n\n"
    : "";
  return ph + "Le point à vérifier d’abord est le brome mesuré à zéro. Les galets d’entretien diffusent généralement lentement. Refaites la mesure avec un test adapté au brome en suivant sa notice. Attendez une mesure conforme à l’étiquette avant la baignade.\n\n" +
    "Depuis quand les galets sont-ils en place et l’eau a-t-elle été renouvelée récemment ? Avez-vous déjà utilisé un brome choc ou un activateur compatible ? Si oui, lequel et quand ? Le nom exact des produits permettra de vérifier ce que leur étiquette prévoit avant d’ajouter quoi que ce soit.";
}
