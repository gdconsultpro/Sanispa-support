import { normalizeDiagnostic } from "./diagnostic-answers";
import { DiagnosticDraft } from "@/lib/types";
import { getSupabaseBrowser } from "./supabase-browser";
import { draftSteps, type DraftStep } from "./client-drafts";
export const draftKey = "sanispa-diagnostic-draft";
export const localDeclarationChanged = "sanispa-declaration-change";
export type LocalDeclarationState = { email: string } | null;

function notifyDeclarationChange(draft?: DiagnosticDraft) {
    const detail: LocalDeclarationState = draft?.problemType && !draft.diagnosticId ? { email: draft.email } : null;
    window.dispatchEvent(new CustomEvent(localDeclarationChanged, { detail }));
}
type LocalProgress = { step: DraftStep; updatedAt: string; pending: boolean };
export const emptyDraft: DiagnosticDraft = { name: "", phone: "", email: "", address: "", postalCode: "", city: "", spaBrand: "", spaModel: "", spaYear: "", installationType: "", powerSupply: "", problemType: "", answers: {}, photos: {}, choice: "", paymentPlan: "" };
function readStoredDraft(): DiagnosticDraft & { localProgress?: LocalProgress } {
    if (typeof window === "undefined")
        return { ...emptyDraft };
    try {
        return normalizeDiagnostic({ ...emptyDraft, ...JSON.parse(window.localStorage.getItem(draftKey) || "{}") });
    }
    catch {
        return { ...emptyDraft };
    }
}
export function readDraft(): DiagnosticDraft {
    const { localProgress: _progress, ...draft } = readStoredDraft();
    return draft;
}
export function readLocalProgress() {
    const { localProgress, ...draft } = readStoredDraft();
    if (!draft.problemType || draft.diagnosticId) return null;
    if (localProgress && draftSteps.includes(localProgress.step)) return { draft, ...localProgress };
    if (!draft.version) return { draft, step: "/diagnostic" as const, updatedAt: null, pending: true };
    return null;
}
export function writeDraft(draft: DiagnosticDraft, step?: DraftStep, pending = true) {
    try {
        const previous = step ? null : readStoredDraft();
        const localStep = step || (previous?.draftId === draft.draftId ? previous?.localProgress?.step : undefined);
        const value = JSON.stringify({
            ...normalizeDiagnostic(draft),
            version: draft.draftId ? versions.get(draft.draftId) ?? draft.version : draft.version,
            ...(localStep ? { localProgress: { step: localStep, updatedAt: new Date().toISOString(), pending } } : {}),
        });
        window.localStorage.setItem(draftKey, value);
        notifyDeclarationChange(draft);
        return value;
    }
    catch {
        throw new Error("La sauvegarde sur cet appareil est impossible. Réduisez les photos ou libérez de l'espace.");
    }
}
export function clearDraft() {
    window.localStorage.removeItem("sanispa-water-session-token");
    clearLocalDraft();
}
function clearLocalDraft() {
    window.localStorage.removeItem(draftKey);
    notifyDeclarationChange();
}
export async function authHeaders() {
    const { data, error } = await getSupabaseBrowser().auth.getSession();
    if (error || !data.session)
        throw new Error("Reconnectez-vous pour enregistrer votre diagnostic.");
    return { Authorization: `Bearer ${data.session.access_token}` };
}
const versions = new Map<string, number>();
let queue: Promise<unknown> = Promise.resolve();
export async function cancelDraft(localId: string | undefined, serverId?: string) {
    const snapshot = readLocalProgress();
    if (serverId) {
        await queue.catch(() => {});
        const response = await fetch(`/api/client/drafts?id=${encodeURIComponent(serverId)}`, {
            method: "DELETE",
            headers: await authHeaders(),
        });
        if (!response.ok) {
            const result = await response.json().catch(() => null);
            if (result?.code !== "DRAFT_SUBMITTED") throw new Error(result?.error || "Impossible d’annuler ce brouillon. Réessayez.");
            if (readLocalProgress()?.draft.draftId === serverId) clearLocalDraft();
            return { submitted: true };
        }
        versions.delete(serverId);
    }
    const current = readLocalProgress();
    if (current && (serverId ? current.draft.draftId === serverId
        : snapshot && current.draft.draftId === localId && current.updatedAt === snapshot.updatedAt)) {
        clearLocalDraft();
    }
    return { submitted: false };
}

export async function saveDraft(input: DiagnosticDraft, step: DraftStep) {
    const draft = normalizeDiagnostic(input);
    const id = draft.draftId || crypto.randomUUID();
    const localSnapshot = writeDraft({ ...draft, draftId: id }, step);
    const work = queue.catch(() => { }).then(async () => {
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
        if (window.localStorage.getItem(draftKey) === localSnapshot) writeDraft(next, step, false);
        return next;
    });
    queue = work;
    return work;
}
export async function restoreDraft(id: string, { signup = false } = {}) {
    const headers = await authHeaders();
    const response = signup
        ? await fetch("/api/client/drafts", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        })
        : await fetch(`/api/client/drafts?id=${encodeURIComponent(id)}`, { headers });
    const result = await response.json();
    if (!response.ok)
        throw new Error(result.error || "Diagnostic introuvable.");
    if (result.draft.submitted_at) {
        if (readDraft().draftId === id) clearDraft();
        return { submitted: true, step: "/espace-client" };
    }
    if (!draftSteps.includes(result.draft.step)) throw new Error("Cette étape n’est plus disponible.");
    const draft = normalizeDiagnostic({ ...emptyDraft, ...result.draft.payload, draftId: result.draft.id, version: result.draft.version });
    versions.set(id, draft.version);
    writeDraft(draft, result.draft.step, false);
    return { submitted: false, step: result.draft.step, draft };
}
