import { problemTypes } from "./questions";
import type { DiagnosticDraft } from "./types";

/** Carry only the category in the link; contact details stay on the original device. */
export function clientConfirmationUrl(origin: string, problemType?: string, intent: "diagnostic" | "premium" = "diagnostic") {
  const url = new URL("/auth/retour", origin);
  url.searchParams.set("next", intent);
  if (problemTypes.some((p) => p.value === problemType))
    url.searchParams.set("problemType", problemType!);
  return url.href;
}

/** Token stays in the URL fragment, outside HTTP logs and Referrer headers. */
export function clientTokenConfirmationUrl(origin: string, token: string, intent: "diagnostic" | "premium" | "recovery" | "admin", problemType?: string) {
  const base = new URL(origin);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && base.hostname === "localhost"))
    throw new Error("Invalid confirmation origin");
  const url = new URL(clientConfirmationUrl(base.origin, problemType, intent === "premium" ? "premium" : "diagnostic"));
  if (intent === "recovery" || intent === "admin") url.searchParams.set("next", intent);
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
    draft.email.trim().toLowerCase() === email.toLowerCase()
  )
    return "/questionnaire";
  return declarationIntent ? "/diagnostic" : "/espace-client";
}
