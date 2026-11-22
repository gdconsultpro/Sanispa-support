import { adminDossierId, adminDossierSection } from "./admin-navigation";
import { problemTypes } from "./questions";
import type { DiagnosticDraft } from "./types";
export function publicClientIntent(value: string | null) {
  return ["premium", "visio", "carnet", "releves", "notices", "assistant", "forum", "compte", "partenaire"].includes(value || "") ? value as "premium" | "visio" | "carnet" | "releves" | "notices" | "assistant" | "forum" | "compte" | "partenaire" : "diagnostic";
}

/** Carry only the category in the link; contact details stay on the original device. */
export function clientConfirmationUrl(origin: string, problemType?: string, intent: "diagnostic" | "premium" = "diagnostic") {
  const url = new URL("/auth/retour", origin);
  url.searchParams.set("next", intent);
  if (problemTypes.some((p) => p.value === problemType))
    url.searchParams.set("problemType", problemType!);
  return url.href;
}

/** Token stays in the URL fragment, outside HTTP logs and Referrer headers. */
export function clientTokenConfirmationUrl(origin: string, token: string, intent: "diagnostic" | "premium" | "recovery" | "admin" | "visio" | "carnet" | "releves" | "notices" | "assistant" | "forum" | "compte" | "partenaire", problemType?: string, adminDestination?: { dossier?: string | null; section?: string | null }) {
  const base = new URL(origin);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && base.hostname === "localhost"))
    throw new Error("Invalid confirmation origin");
  const url = new URL(clientConfirmationUrl(base.origin, problemType, intent === "premium" ? "premium" : "diagnostic"));
  if (["recovery", "admin", "visio", "carnet", "releves", "notices", "assistant", "forum", "compte", "partenaire"].includes(intent)) url.searchParams.set("next", intent);
  const adminId = intent === "admin" ? adminDossierId(adminDestination?.dossier) : null;
  if (adminId) {
    url.searchParams.set("dossier", adminId);
    url.searchParams.set("section", adminDossierSection(adminDestination?.section));
  }
  url.hash = new URLSearchParams({ token_hash: token, type: intent === "recovery" ? "recovery" : "email" }).toString();
  return url.href;
}
export function confirmedClientDestination(
  draft: DiagnosticDraft,
  email: string,
  declarationIntent = true,
) {
  if (
    draft.problemType &&
    !draft.diagnosticId &&
    (draft.email.trim().toLowerCase() === email.toLowerCase() ||
      (declarationIntent && !draft.email.trim() && !draft.version))
  )
    return draft.problemType === "demenagement" ? "/upload" : "/questionnaire";
  return declarationIntent ? "/diagnostic" : "/espace-client";
}
