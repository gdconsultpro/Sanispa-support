import { adminDenied } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
const partnerSchema = z.object({
    company_name: z.string().trim().min(2).max(150),
    siret: z.string().transform(v=>v.replace(/\s/g,"" )).pipe(z.string().regex(/^\d{14}$/)),
    contact_name: z.string().trim().min(2).max(150),
    email: z.string().email(),
    phone: z.string().trim().min(6).max(30),
    address: z.string().trim().min(3).max(300),
    postal_code: z.string().regex(/^\d{5}$/),
    city: z.string().trim().min(1).max(120),
    departments: z.array(z.string()).default([])
});
export async function POST(request: Request) {
    const denied = await adminDenied(request);
    if (denied)
        return denied;
    try {
        const payload = partnerSchema.parse(await request.json());
        const supabase = getSupabaseAdmin();
        const { data: partner, error } = await supabase
            .from("partners")
            .insert({
            company_name: payload.company_name,
            contact_name: payload.contact_name || null,
            email: payload.email,
            phone: payload.phone || null,
            address: payload.address || null,
            postal_code: payload.postal_code || null,
            city: payload.city || null,
            siret: payload.siret,
            verification_status: "pending",
            active: true
        })
            .select("*")
            .single();
        if (error)
            throw error;
        await replaceDepartments(supabase, partner.id, payload.departments);
        return NextResponse.json({ partner: { ...partner, departments: normalizeDepartments(payload.departments) } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Erreur partenaire";
        return NextResponse.json({ error: message }, { status: 400 });
    }
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
