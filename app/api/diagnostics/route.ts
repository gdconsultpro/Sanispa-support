import { NextResponse } from "next/server";
import { z } from "zod";
import { getPhotoRequirements, questionSets, problemTypes } from "@/lib/questions";
import { requireUser, rateLimit } from "@/lib/client-auth";
import { readJson, apiError, HttpError } from "@/lib/http";
import { validateSubmission } from "@/lib/draft-schema";
import { decodePhoto } from "@/lib/photos";
import { getDepartmentFromPostalCode } from "@/lib/partners";
import { processNotifications } from "@/lib/notifications";
export async function POST(request: Request) {
    try {
        const { user, supabase } = await requireUser(request);
        await rateLimit(supabase, `submit:${user.id}`, 10);
        const { draftId } = z.object({ draftId: z.string().uuid() }).parse(await readJson(request, 1000));
        const { data: draft, error } = await supabase.from("diagnostic_drafts").select("*").eq("id", draftId).eq("user_id", user.id).maybeSingle();
        if (error)
            throw error;
        if (!draft)
            throw new HttpError(404, "Diagnostic introuvable.");
        if (draft.submitted_at)
            return NextResponse.json({ diagnosticId: draftId });
        let payload;
        try {
            payload = validateSubmission(draft.payload);
        }
        catch (e) {
            throw new HttpError(400, e instanceof Error ? e.message : "Dossier incomplet.");
        }
        const isWaterAnalysis = payload.problemType === "traitement-eau" && payload.choice === "remote";
        const department = getDepartmentFromPostalCode(payload.postalCode);
        const partnerIds = isWaterAnalysis || payload.choice === "intervention" ? [] : await findPartnerIdsForDepartment(supabase, department);
        const answers = questionSets[payload.problemType].filter(q => payload.answers[q.id] && (!q.showWhen || payload.answers[q.showWhen.questionId] === q.showWhen.equals)).map(q => ({ question_key: q.id, question_label: q.label, answer: payload.answers[q.id] }));
        const photos = [];
        for (const photo of getPhotoRequirements(payload.problemType)) {
            if (!payload.photos[photo.id])
                continue;
            let upload;
            try {
                upload = decodePhoto(payload.photos[photo.id]);
            }
            catch (e) {
                throw new HttpError(400, e instanceof Error ? e.message : "Photo invalide.");
            }
            const path = `${draftId}/${photo.id}-${upload.hash}`;
            const { error } = await supabase.storage.from("diagnostic-photos").upload(path, upload.buffer, { contentType: upload.contentType, upsert: true });
            if (error)
                throw error;
            photos.push({ photo_type: photo.id, storage_path: path, public_url: null });
        }
        const emailPayload = { diagnosticId: draftId, customer: { name: payload.name, phone: payload.phone, email: user.email!, address: [payload.address, payload.postalCode, payload.city].filter(Boolean).join(" - "), spaBrand: payload.spaBrand, spaModel: payload.spaModel, spaYear: payload.spaYear }, problemType: payload.problemType, choice: payload.choice, paymentPlan: isWaterAnalysis ? "water" : null, status: isWaterAnalysis ? "En attente de paiement" : "Demande enregistrée", answers, photos, appUrl: process.env.NEXT_PUBLIC_APP_URL };
        const jobs: Array<{
            key: string;
            kind: string;
            payload: unknown;
        }> = [{ key: `${draftId}:admin`, kind: "admin", payload: emailPayload }, { key: `${draftId}:customer`, kind: "customer", payload: emailPayload }];
        const partners = await loadActivePartnerRecipients(supabase, partnerIds);
        for (const partner of partners)
            jobs.push({ key: `${draftId}:partner:${partner.id}`, kind: "partner", payload: { diagnosticId: draftId, partners: [partner], problemType: getProblemTypeLabel(payload.problemType), postalCode: payload.postalCode, city: payload.city, department, spaBrand: payload.spaBrand, spaModel: payload.spaModel, answers: [] } });
        const saved = await supabase.rpc("submit_diagnostic", { p_id: draftId, p_user: user.id, p_version: draft.version, p_department: department, p_partners: partnerIds, p_answers: answers, p_photos: photos, p_jobs: jobs });
        if (saved.error?.message.includes("DRAFT_CONFLICT"))
            throw new HttpError(409, "Le diagnostic a été modifié. Rechargez votre saisie avant de valider.");
        if (saved.error)
            throw saved.error;
        try {
            await processNotifications(draftId);
        }
        catch {
            console.error("Notifications en attente de relance");
        }
        return NextResponse.json({ diagnosticId: draftId });
    }
    catch (e) {
        return apiError(e);
    }
}
async function findPartnerIdsForDepartment(supabase: any, department: string): Promise<string[]> {
    if (!department)
        return [];
    const { data, error } = await supabase
        .from("partner_departments")
        .select("partner_id, partners!inner(active)")
        .eq("department", department)
        .eq("partners.active", true);
    if (error) {
        console.error("[SANISPA partners] impossible de charger les partenaires du département", { department, error });
        throw error;
    }
    return Array.from(new Set((data ?? []).map((row: any) => row.partner_id).filter(Boolean) as string[]));
}
async function loadActivePartnerRecipients(supabase: any, partnerIds: string[]) {
    if (!partnerIds.length)
        return [];
    const { data, error } = await supabase
        .from("partners")
        .select("id, company_name, contact_name, email, active")
        .in("id", partnerIds)
        .eq("active", true);
    if (error) {
        console.error("[SANISPA partenaires] impossible de charger les partenaires actifs", {
            partnerIds,
            error
        });
        return [];
    }
    return (data ?? [])
        .filter((partner: any) => partner.email)
        .map((partner: any) => ({
        id: partner.id,
        companyName: partner.company_name,
        contactName: partner.contact_name,
        email: partner.email
    }));
}
function getProblemTypeLabel(problemType: string) {
    return problemTypes.find((item) => item.value === problemType)?.label ?? problemType;
}
