import { DiagnosticDraft } from "@/lib/types";

export const draftKey = "sanispa-diagnostic-draft";

export const emptyDraft: DiagnosticDraft = {
  name: "",
  phone: "",
  email: "",
  address: "",
  spaBrand: "",
  spaModel: "",
  spaYear: "",
  installationType: "",
  powerSupply: "",
  problemType: "",
  answers: {},
  photos: {},
  choice: "",
  paymentPlan: ""
};

export function readDraft(): DiagnosticDraft {
  if (typeof window === "undefined") return emptyDraft;
  const raw = window.localStorage.getItem(draftKey);
  if (!raw) return emptyDraft;
  try {
    return { ...emptyDraft, ...JSON.parse(raw) };
  } catch {
    return emptyDraft;
  }
}

export function writeDraft(draft: DiagnosticDraft) {
  window.localStorage.setItem(draftKey, JSON.stringify(draft));
}

export function clearDraft() {
  window.localStorage.removeItem(draftKey);
}
