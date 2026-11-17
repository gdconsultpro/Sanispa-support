import { problemTypes } from "./questions";
import type { DiagnosticDraft } from "./types";

/** Carry only the category in the link; contact details stay on the original device. */
export function clientConfirmationUrl(origin: string, problemType?: string) {
  const url = new URL("/auth/retour", origin);
  url.searchParams.set("next", "diagnostic");
  if (problemTypes.some((p) => p.value === problemType))
    url.searchParams.set("problemType", problemType!);
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
    draft.email.trim().toLowerCase() === email.toLowerCase()
  )
    return "/questionnaire";
  return declarationIntent ? "/diagnostic" : "/espace-client";
}
