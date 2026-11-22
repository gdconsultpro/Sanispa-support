import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { loadAdminPartnerApprovalEmails } from "@/lib/admin-partner-approval-email";
import { apiError } from "@/lib/http";
import { processNotifications } from "@/lib/notifications";
import { NextResponse } from "next/server";
import { z } from "zod";
const partnerSchema = z.object({
    siret: z.string().transform(v=>v.replace(/\s/g,"" )).pipe(z.string().regex(/^\d{14}$/)).optional(),
    company_name: z.string().min(1).optional(),
    contact_name: z.string().optional().nullable(),
    email: z.string().email().optional(),
    phone: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    postal_code: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    active: z.boolean().optional(),
    departments: z.array(z.string()).optional()
}).strict();
const commandSchema=z.union([
    z.object({verify:z.literal(true),expectedSiret:z.string().regex(/^\d{14}$/)}).strict(),
    z.object({sendApproval:z.literal(true)}).strict(),
    partnerSchema,
]);
type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Context) {
    try {
        const { supabase, user } = await administrator(request.headers);
        requireSameOrigin(request);
        const id = z.string().uuid().parse((await params).id);
        const { error } = await supabase.rpc("delete_admin_partner", { p_partner: id, p_actor: user.id });
        if (error?.message === "ADMIN_REQUIRED")
            return NextResponse.json({ error: "Accès administrateur requis." }, { status: 403 });
        if (error?.message === "PARTNER_HAS_HISTORY" || error?.code === "23503")
            return NextResponse.json({
                error: "Cette entreprise est liée à des dossiers, des documents ou des données de travail. Vous pouvez désactiver son accès."
            }, { status: 409 });
        if (error) throw error;
        return NextResponse.json({ deleted: true });
    } catch (error) {
        return apiError(error);
    }
}

export async function PATCH(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const {supabase,user}=await administrator(request.headers);
        requireSameOrigin(request);
        const id = z.string().uuid().parse((await params).id);
        const payload = commandSchema.parse(await request.json());
        if ("verify" in payload || "sendApproval" in payload) {
            const verifying = "verify" in payload;
            const result = await supabase.rpc("notify_partner_approval",{
                p_partner:id,p_actor:user.id,p_expected_siret:verifying ? payload.expectedSiret : null,
            });
            if(result.error?.message==="SIRET_CHANGED")
                return NextResponse.json({error:"Le SIRET a changé. Examinez le nouveau numéro avant de le valider.",partner:await loadPartner(supabase,id)},{status:409});
            if(result.error?.message==="INCOMPLETE_REGISTRATION" || result.error?.message==="PARTNER_NOT_VERIFIED")
                return NextResponse.json({error:verifying
                    ? "Vérification impossible. Renseignez le SIRET, le contact et l’adresse complète de l’entreprise active."
                    : "La confirmation est disponible pour les entreprises actives et vérifiées."},{status:409});
            if (result.error) throw result.error;
            await processNotifications(result.data).catch(() => undefined);
            const partner = await loadPartner(supabase,id);
            return NextResponse.json({partner, approvalEmail: partner.approval_email?.state ?? "pending"});
        }
        const { departments, ...partnerPayload } = payload;
        if (Object.keys(partnerPayload).length) {
            const { error } = await supabase.from("partners").update({...partnerPayload,...(Object.keys(partnerPayload).some(k=>k!=="active")?{verification_status:"pending",verified_at:null,verified_by:null}:{})}).eq("id", id);
            if (error)
                throw error;
        }
        if (departments) {
            await replaceDepartments(supabase, id, departments);
        }
        const partner = await loadPartner(supabase, id);
        return NextResponse.json({ partner });
    }
    catch (error) {
        return apiError(error);
    }
}
async function loadPartner(supabase: any, id: string) {
    const { data, error } = await supabase
        .from("partners")
        .select("*, partner_departments(department)")
        .eq("id", id)
        .single();
    if (error)
        throw error;
    const approvalEmails = await loadAdminPartnerApprovalEmails(supabase, data.verification_status === "verified" ? [id] : []);
    return {
        ...data,
        approval_email: approvalEmails ? approvalEmails.get(id) ?? null : undefined,
        departments: (data.partner_departments ?? []).map((row: {
            department: string;
        }) => row.department)
    };
}
async function replaceDepartments(supabase: any, partnerId: string, departments: string[]) {
    const normalized = normalizeDepartments(departments);
    await supabase.from("partner_departments").delete().eq("partner_id", partnerId);
    if (!normalized.length)
        return;
    const { error } = await supabase.from("partner_departments").insert(normalized.map((department) => ({
        partner_id: partnerId,
        department
    })));
    if (error)
        throw error;
}
function normalizeDepartments(departments: string[]) {
    return Array.from(new Set(departments.map((department) => department.trim().toUpperCase()).filter(v=>/^(?:\d{2,3}|2[AB])$/.test(v))));
}
