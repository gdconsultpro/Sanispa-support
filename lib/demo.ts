import type { AnswerValue, ProblemType } from "./types";
import { leadCatalog, type LeadCategory } from "./partner-catalog";

export type DemoRole = "client" | "partenaire" | "admin";
export const demoNavigation = {
  client: [
    { id: "accueil", label: "Mon spa" }, { id: "declaration", label: "Déclarer une panne" },
    { id: "documents", label: "Rapports et factures" }, { id: "ia", label: "Assistant IA" },
    { id: "carnet", label: "Carnet et eau" }, { id: "notices", label: "Notices" }, { id: "forum", label: "Forum" },
  ],
  partenaire: [
    { id: "demandes", label: "Contacts disponibles" }, { id: "planning", label: "Mon planning" },
    { id: "rapport", label: "Rapport et facture" }, { id: "abonnement", label: "Abonnement et tarifs" },
  ],
  admin: [
    { id: "demandes", label: "Demandes entrantes" }, { id: "partenaires", label: "Partenaires" },
    { id: "interventions", label: "Suivi des interventions" }, { id: "moderation", label: "Modération du forum" },
    { id: "pilotage", label: "Premium et pilotage" }, { id: "synchroteam", label: "Préparation Synchroteam" },
  ],
} as const;
export function demoView(role?: string, tab?: string) {
  const validRole: DemoRole = role === "admin" || role === "partenaire" ? role : "client";
  const navigation = demoNavigation[validRole];
  return { role: validRole, tab: navigation.some(item => item.id === tab) ? tab! : navigation[0].id };
}
export type DemoReading = { id: string; date: string; ph: number | null; tac: number | null; disinfectant: number | null; temperature: number | null };
export type DemoPost = { id: string; title: string; body: string; state: "pending" | "approved" | "rejected"; author: string };
export type DemoState = {
  premium: boolean; partnerSubscription: boolean; charter: boolean;
  problem: ProblemType; answers: Record<string, AnswerValue>; photos: string[];
  dispatch: "pending" | "kept" | "released"; contactPaid: boolean; appointment: string;
  report: null | { findings: string; actions: string; next: string };
  invoice: boolean; outcome: "repaired" | "quote_pending" | "abandoned" | null;
  ratings: { responsiveness: number; professionalism: number; pricing: number } | null;
  readings: DemoReading[]; selectedReading: string;
  journal: { id: string; text: string; date: string }[];
  reminders: { id: string; title: string; date: string; done: boolean }[];
  messages: { role: "user" | "assistant"; text: string }[];
  posts: DemoPost[]; events: string[]; spa: { brand: string; model: string; volume: string };
};
export function createDemoState(role: DemoRole = "client"): DemoState {
  return {
    premium: true, partnerSubscription: true, charter: true, problem: "fuite",
    answers: { visible_leak: "Oui", spa_access: "Oui sur les 4 côtés", leak_water_outside: "Oui", level_drop_cm: "3", level_drop_duration: "En 24 heures", running_only: "Non", suspected_area: ["Raccord"], started_when: "Depuis deux jours" },
    photos: ["Vue du spa", "Zone du raccord", "Clavier"], dispatch: role === "partenaire" ? "released" : "pending", contactPaid: false,
    appointment: "", report: null, invoice: false, outcome: null, ratings: null,
    readings: [{ id: "demo-reading-1", date: "18 novembre", ph: 7.8, tac: 90, disinfectant: 0.4, temperature: 36 }, { id: "demo-reading-2", date: "16 novembre", ph: 7.4, tac: 100, disinfectant: 1.5, temperature: 36 }], selectedReading: "demo-reading-1",
    journal: [{ id: "demo-journal-1", text: "Nettoyage du filtre", date: "16 novembre" }, { id: "demo-journal-2", text: "Vidange et remise en eau", date: "2 novembre" }],
    reminders: [{ id: "demo-reminder-1", title: "Contrôler le filtre selon ma notice", date: "23 novembre", done: false }, { id: "demo-reminder-2", title: "Faire un relevé de l’eau", date: "20 novembre", done: false }],
    messages: [{ role: "assistant", text: "Bienvenue dans la démonstration de l’assistant SANISPA. Choisissez un sujet et posez une question : les réponses de cet espace sont simulées, sans appel à une IA réelle." }],
    posts: [{ id: "demo-post-1", title: "Comment organiser mon entretien ?", body: "J’utilise mon carnet pour noter les nettoyages et les références de mes filtres. Et vous ?", state: "approved", author: "Alex · démo" }, { id: "demo-post-2", title: "Mon premier relevé d’eau", body: "Je viens de noter mes premières mesures dans le carnet SANISPA.", state: "pending", author: "Camille · démo" }],
    events: [role === "partenaire" ? "SANISPA a validé la proposition de contact fictive." : "Une déclaration fictive attend la décision de SANISPA."],
    spa: { brand: "Aqua Démo", model: "Horizon 5 places", volume: "1 000 litres" },
  };
}
export function demoLead(problem: ProblemType) {
  const category: LeadCategory = problem === "bruit-anormal" || problem === "traitement-eau" ? "autre" : problem;
  return leadCatalog[category];
}
export function demoStatus(state: DemoState) {
  if (state.problem === "traitement-eau") return "Conseil Premium";
  if (state.outcome === "quote_pending") return "Devis en cours";
  if (state.outcome) return "Dossier clôturé";
  if (state.report) return "Rapport à valider";
  if (state.appointment) return "Rendez-vous confirmé";
  if (state.contactPaid) return "Partenaire accepté";
  return state.dispatch === "kept" ? "Conservé par SANISPA" : state.dispatch === "released" ? "Proposition transmise" : "À valider par SANISPA";
}
export type DemoAction =
  | { type: "reset"; role: DemoRole }
  | { type: "problem"; problem: ProblemType }
  | { type: "answers"; answers: Record<string, AnswerValue> }
  | { type: "photos"; label: string }
  | { type: "submit" }
  | { type: "dispatch"; decision: "kept" | "released" | "pending" }
  | { type: "acquire" }
  | { type: "schedule"; date: string }
  | { type: "report"; report: NonNullable<DemoState["report"]> }
  | { type: "invoice" }
  | { type: "validate"; outcome: NonNullable<DemoState["outcome"]>; ratings: NonNullable<DemoState["ratings"]> }
  | { type: "premium"; active: boolean }
  | { type: "charter"; accepted: boolean }
  | { type: "subscription"; active: boolean }
  | { type: "reading"; reading: DemoReading }
  | { type: "selectReading"; id: string }
  | { type: "journal"; text: string }
  | { type: "reminder"; title: string; date: string }
  | { type: "completeReminder"; id: string }
  | { type: "ask"; topic: string; text: string; includeReading: boolean }
  | { type: "post"; title: string; body: string }
  | { type: "moderate"; id: string; decision: "approved" | "rejected" }
  | { type: "spa"; spa: DemoState["spa"] };
const event = (state: DemoState, text: string) => [text, ...state.events].slice(0, 12);
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "reset": return createDemoState(action.role);
    case "problem": return { ...state, problem: action.problem, answers: {}, dispatch: "pending", contactPaid: false, appointment: "", report: null, invoice: false, outcome: null, ratings: null };
    case "answers": return { ...state, answers: action.answers };
    case "photos": return state.photos.includes(action.label) ? state : { ...state, photos: [...state.photos, action.label].slice(0, 5) };
    case "submit": return { ...state, dispatch: "pending", contactPaid: false, appointment: "", report: null, invoice: false, outcome: null, ratings: null, events: event(state, "Nouvelle déclaration fictive : notification SANISPA simulée.") };
    case "dispatch": return state.contactPaid || state.problem === "traitement-eau" ? state : { ...state, dispatch: action.decision, events: event(state, action.decision === "released" ? "SANISPA valide et transmet la proposition au partenaire fictif." : action.decision === "kept" ? "SANISPA conserve ce chantier fictif." : "La déclaration fictive revient à valider.") };
    case "acquire": return state.dispatch !== "released" || !state.partnerSubscription || !state.charter || state.contactPaid || state.problem === "traitement-eau" ? state : { ...state, contactPaid: true, events: event(state, "Règlement fictif accepté : coordonnées démo débloquées et notification SANISPA simulée.") };
    case "schedule": return !state.contactPaid || !action.date ? state : { ...state, appointment: action.date, events: event(state, "Rendez-vous fictif confirmé dans les trois espaces.") };
    case "report": return !state.contactPaid || !state.appointment ? state : { ...state, report: action.report, outcome: null, ratings: null, events: event(state, "Rapport fictif disponible : demande de validation client simulée.") };
    case "invoice": return !state.contactPaid ? state : { ...state, invoice: true, events: state.invoice ? state.events : event(state, "Facture d’intervention fictive ajoutée au dossier client.") };
    case "validate": return !state.report || (action.outcome === "repaired" && !state.invoice) || Object.values(action.ratings).some(n => n < 1 || n > 5) ? state : { ...state, outcome: action.outcome, ratings: action.ratings, events: event(state, "Le client démo a validé le rapport et renseigné ses trois notes.") };
    case "premium": return { ...state, premium: action.active };
    case "charter": return { ...state, charter: action.accepted };
    case "subscription": return action.active && !state.charter ? state : { ...state, partnerSubscription: action.active };
    case "reading": return !state.premium ? state : { ...state, readings: [action.reading, ...state.readings].slice(0, 20), selectedReading: action.reading.id };
    case "selectReading": return { ...state, selectedReading: action.id };
    case "journal": return !state.premium || !action.text.trim() ? state : { ...state, journal: [{ id: `demo-journal-${state.journal.length + 1}`, text: action.text.slice(0, 500), date: "Aujourd’hui · démo" }, ...state.journal] };
    case "reminder": return !state.premium || !action.title.trim() ? state : { ...state, reminders: [...state.reminders, { id: `demo-reminder-${state.reminders.length + 1}`, title: action.title.slice(0, 120), date: action.date || "Prochaine échéance · démo", done: false }] };
    case "completeReminder": return !state.premium || !state.reminders.some(r => r.id === action.id && !r.done) ? state : { ...state, reminders: state.reminders.map(r => r.id === action.id ? { ...r, done: true } : r), journal: [{ id: `demo-journal-${state.journal.length + 1}`, text: state.reminders.find(r => r.id === action.id)!.title + " — effectué", date: "Aujourd’hui · démo" }, ...state.journal] };
    case "ask": {
      if (!state.premium || !action.text.trim()) return state;
      const reading = action.includeReading ? state.readings.find(r => r.id === state.selectedReading) : undefined;
      const answer = action.topic === "eau" ? `${reading ? `Relevé démo sélectionné : pH ${reading.ph ?? "inconnu"}, TAC ${reading.tac ?? "inconnu"}, désinfectant ${reading.disinfectant ?? "inconnu"}, température ${reading.temperature ?? "inconnue"} °C. ` : "Commencez par renseigner les mesures déjà disponibles dans votre tableau d’eau. "}Pour illustrer l’accompagnement, je vous demanderais le volume précis, le désinfectant et la référence du produit avant de proposer un ajustement. Aucun dosage n’est donné dans cette réponse simulée.`
        : action.topic === "panne" ? "Exemple d’accompagnement : précisez le symptôme, depuis quand il est visible et ce que vous avez déjà observé. En cas de disjonction, ne remettez pas le spa en marche pour reproduire la panne et ne démontez aucun élément. Le dossier permet ensuite de solliciter un technicien. Cette réponse est simulée et ne constitue pas un diagnostic."
        : action.topic === "notices" ? "Pour retrouver la bonne notice, relevez la marque et la référence déjà visibles sur votre clavier, sans démontage. L’espace Notices présente les documents vérifiés par modèle. Cette réponse est un exemple simulé."
        : "Exemple de guide : notez les entretiens déjà réalisés, puis créez vos rappels en vous référant à la notice et à votre usage. La fréquence dépend de votre équipement ; aucune périodicité universelle n’est imposée. Cette réponse est simulée.";
      return { ...state, messages: [...state.messages, { role: "user" as const, text: action.text.slice(0, 2000) }, { role: "assistant" as const, text: answer }].slice(-20) };
    }
    case "post": return !state.premium || !action.title.trim() || !action.body.trim() ? state : { ...state, posts: [{ id: `demo-post-${state.posts.length + 1}`, title: action.title.slice(0, 100), body: action.body.slice(0, 1000), state: "pending", author: "Camille · démo" }, ...state.posts], events: event(state, "Un message fictif du forum attend la modération de SANISPA.") };
    case "moderate": return { ...state, posts: state.posts.map(p => p.id === action.id ? { ...p, state: action.decision } : p) };
    case "spa": return { ...state, spa: action.spa };
    default: return state;
  }
}
