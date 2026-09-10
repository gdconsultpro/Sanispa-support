import { problemTypes } from "./questions";
const states: Record<string,string> = {
  NEW: "Nouvelle demande", AVAILABLE: "Demande reçue", ASSIGNED: "Technicien assigné", CLOSED: "Dossier clos",
  WATER_ANALYSIS: "Analyse de l’eau", TECHNICAL_REQUEST: "Demande technique",
  paid: "Payé", pending: "En attente de paiement", failed: "Paiement échoué", refunded: "Remboursé", expired: "Expiré", canceled: "Annulé", cancelled: "Annulé"
};
export const statusLabel = (status: string | null | undefined) => status ? states[status] ?? status : "Non renseigné";
export const problemLabel = (problem: string) => problemTypes.find(p => p.value === problem)?.label ?? problem;
