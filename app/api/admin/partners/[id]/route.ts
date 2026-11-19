import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError } from "@/lib/http";
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
const commandSchema=z.union([z.object({verify:z.literal(true)}).strict(),partnerSchema]);
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
        if ("verify" in payload) {
            const result=await supabase.rpc("verify_partner_registration",{p_partner:id,p_actor:user.id});
            if(result.error) return NextResponse.json({error:"Vérification impossible. Renseignez le SIRET, le contact et l’adresse complète de l’entreprise active."},{status:409});
            return NextResponse.json({partner:await loadPartner(supabase,id)});
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
    return {
        ...data,
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
