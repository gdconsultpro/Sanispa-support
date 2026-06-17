import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const partnerSchema = z.object({
  company_name: z.string().min(1),
  contact_name: z.string().optional().nullable(),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  departments: z.array(z.string()).default([])
});

export async function POST(request: Request) {
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
        active: true
      })
      .select("*")
      .single();

    if (error) throw error;
    await replaceDepartments(supabase, partner.id, payload.departments);

    return NextResponse.json({ partner: { ...partner, departments: normalizeDepartments(payload.departments) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur partenaire";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function replaceDepartments(supabase: any, partnerId: string, departments: string[]) {
  const normalized = normalizeDepartments(departments);
  await supabase.from("partner_departments").delete().eq("partner_id", partnerId);
  if (!normalized.length) return;
  const { error } = await supabase.from("partner_departments").insert(
    normalized.map((department) => ({
      partner_id: partnerId,
      department
    }))
  );
  if (error) throw error;
}

function normalizeDepartments(departments: string[]) {
  return Array.from(new Set(departments.map((department) => department.replace(/\D/g, "")).filter(Boolean)));
}
