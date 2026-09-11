import { photoRequirements, problemTypes } from "./questions";
const states: Record<string,string> = {
  NEW: "Nouvelle demande", AVAILABLE: "Demande reçue", ASSIGNED: "Technicien assigné", CLOSED: "Dossier clos",
  WATER_ANALYSIS: "Analyse de l’eau", TECHNICAL_REQUEST: "Demande technique",
  nouvelle: "Nouvelle demande", "en analyse": "En analyse", "devis envoyé": "Devis envoyé", "RDV demandé": "Rendez-vous demandé", terminé: "Terminé",
  paid: "Payé", granted: "Prise en charge gratuite", pending: "En attente de paiement", pending_payment: "En attente de paiement", unpaid: "En attente de paiement", failed: "Paiement échoué", refunded: "Remboursé", expired: "Expiré", canceled: "Annulé", cancelled: "Annulé"
};
export const statusLabel = (status: string | null | undefined) => status ? states[status] ?? status : "Non renseigné";
export const problemLabel = (problem: string) => problemTypes.find(p => p.value === problem)?.label ?? problem;
export const photoLabel = (type: string) => photoRequirements.find(p => p.id === type)?.label ?? "Photo jointe";
const choices: Record<string, string> = { intervention: "Demande d'intervention", devis: "Demande de devis", remote: "Assistance à distance" };
const emailStates: Record<string, string> = { sent: "Envoyé", pending: "En attente d’envoi", error: "Échec — à relancer", test_fixture: "Donnée de test" };
export const choiceLabel = (choice: string | null | undefined) => choices[choice ?? ""] ?? "Non renseigné";
export const emailStatusLabel = (status: string | null | undefined) => emailStates[status ?? ""] ?? "Non suivi";
export const installationLabel = (installation: string | null | undefined) => installation === "interieur" ? "Intérieur" : installation === "exterieur" ? "Extérieur" : installation || "Non renseignée";
export const paymentLabel = (status: string | null | undefined, choice?: string | null) => status ? statusLabel(status) : choice === "remote" ? "À régler" : choice ? "Non requis" : "Non renseigné";
