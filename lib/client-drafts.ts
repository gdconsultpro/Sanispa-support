import type { DiagnosticDraft } from "./types";

export const draftSteps = ["/diagnostic", "/questionnaire", "/upload", "/resume"] as const;
export type DraftStep = (typeof draftSteps)[number];
export type SignupDraft = { id: string; step: DraftStep; payload: DiagnosticDraft };
export type DraftListItem = {
  id: string;
  step: DraftStep;
  updated_at: string | null;
  version?: number;
  problemType?: string | null;
  spaId?: string | null;
  spaBrand?: string | null;
  spaModel?: string | null;
  local?: boolean;
};

export function draftStepLabel(step: DraftStep, problem?: string | null) {
  if (step === "/diagnostic") return problem === "demenagement" ? "Le trajet et les accès" : "Votre spa et vos coordonnées";
  if (step === "/questionnaire") return "Les symptômes";
  if (step === "/upload") return problem === "demenagement" ? "Les photos et vidéos" : "Les photos";
  return step === "/resume" ? "Le résumé avant envoi" : "Votre déclaration";
}
