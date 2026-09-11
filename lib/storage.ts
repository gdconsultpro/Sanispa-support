import { normalizeDiagnostic } from "./diagnostic-answers";
import { DiagnosticDraft } from "@/lib/types";
import { getSupabaseBrowser } from "./supabase-browser";
export const draftKey = "sanispa-diagnostic-draft";
export const emptyDraft: DiagnosticDraft = { name: "", phone: "", email: "", address: "", postalCode: "", city: "", spaBrand: "", spaModel: "", spaYear: "", installationType: "", powerSupply: "", problemType: "", answers: {}, photos: {}, choice: "", paymentPlan: "" };
export function readDraft(): DiagnosticDraft {
    if (typeof window === "undefined")
        return { ...emptyDraft };
    try {
        return normalizeDiagnostic({ ...emptyDraft, ...JSON.parse(window.localStorage.getItem(draftKey) || "{}") });
    }
    catch {
        return { ...emptyDraft };
    }
}
export function writeDraft(draft: DiagnosticDraft) {
    try {
        window.localStorage.setItem(draftKey, JSON.stringify({ ...normalizeDiagnostic(draft), version: draft.draftId ? versions.get(draft.draftId) ?? draft.version : draft.version }));
    }
    catch {
        throw new Error("La sauvegarde sur cet appareil est impossible. Réduisez les photos ou libérez de l'espace.");
    }
}
export function clearDraft() { window.localStorage.removeItem(draftKey); window.localStorage.removeItem("sanispa-water-session-token"); }
export async function authHeaders() {
    const { data, error } = await getSupabaseBrowser().auth.getSession();
    if (error || !data.session)
        throw new Error("Reconnectez-vous pour enregistrer votre diagnostic.");
    return { Authorization: `Bearer ${data.session.access_token}` };
}
const versions = new Map<string, number>();
let queue: Promise<unknown> = Promise.resolve();
export async function saveDraft(input: DiagnosticDraft, step: string) {
    const draft = normalizeDiagnostic(input);
    const work = queue.catch(() => { }).then(async () => {
        const id = draft.draftId || crypto.randomUUID();
        const { data } = await getSupabaseBrowser().auth.getSession();
        if (!data.session || !data.session.user.email_confirmed_at)
            throw new Error("Confirmez votre adresse e-mail pour sauvegarder votre diagnostic.");
        if (draft.email.trim().toLowerCase() !== data.session.user.email?.toLowerCase())
            throw new Error("Ce brouillon correspond à une autre adresse. Reprenez votre dossier depuis votre espace client.");
        const version = versions.get(id) ?? draft.version ?? 0;
        const response = await fetch("/api/client/drafts", { method: "PUT", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ id, version, step, payload: draft }) });
        const result = await response.json();
        if (!response.ok)
            throw new Error(result.error || "Sauvegarde impossible.");
        versions.set(id, result.draft.version);
        const next = { ...draft, draftId: id, version: result.draft.version };
        writeDraft(next);
        return next;
    });
    queue = work;
    return work;
}
export async function restoreDraft(id: string) {
    const response = await fetch(`/api/client/drafts?id=${encodeURIComponent(id)}`, { headers: await authHeaders() });
    const result = await response.json();
    if (!response.ok)
        throw new Error(result.error || "Diagnostic introuvable.");
    if (result.draft.submitted_at) {clearDraft();return { submitted: true, step: "/espace-client" };}
    const draft = normalizeDiagnostic({ ...emptyDraft, ...result.draft.payload, draftId: result.draft.id, version: result.draft.version });
    versions.set(id, draft.version);
    writeDraft(draft);
    return { submitted: false, step: result.draft.step, draft };
}
