import { problemLabel } from "@/lib/display-labels";
import type { AdminDiagnostic } from "@/lib/types";

const descriptionKeys = new Set(["description", "noise_description", "pump_details"]);

/** Only the customer's existing free-text answers describe the problem. */
export function adminProblemDescription(diagnostic: AdminDiagnostic) {
  return diagnostic.diagnostic_answers
    .filter(answer => answer.question_key && descriptionKeys.has(answer.question_key))
    .map(answer => answer.answer.trim()).filter(Boolean).join("\n\n");
}

export function adminRequestSubject(diagnostic: AdminDiagnostic) {
  const category = problemLabel(diagnostic.problem_type) || "Motif non renseigné";
  const description = adminProblemDescription(diagnostic).replace(/\s+/g, " ").trim();
  if (!description) return category;
  return `${category} — ${description.length > 100 ? `${description.slice(0, 97).trimEnd()}…` : description}`;
}

export function adminDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {dateStyle:"short",timeStyle:"short",timeZone:"Europe/Paris"}).format(new Date(value));
}
