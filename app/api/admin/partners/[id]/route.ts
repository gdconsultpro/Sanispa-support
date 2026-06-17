import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const partnerSchema = z.object({
  company_name: z.string().min(1).optional(),
  contact_name: z.string().optional().nullable(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  active: z.boolean().optional(),
  departments: z.array(z.string()).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = partnerSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { departments, ...partnerPayload } = payload;

    if (Object.keys(partnerPayload).length) {
      const { error } = await supabase.from("partners").update(partnerPayload).eq("id", id);
      if (error) throw error;
    }

    if (departments) {
      await replaceDepartments(supabase, id, departments);
    }

    const partner = await loadPartner(supabase, id);
    return NextResponse.json({ partner });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur partenaire";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function loadPartner(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("partners")
    .select("*, partner_departments(department)")
    .eq("id", id)
    .single();

  if (error) throw error;

  return {
    ...data,
    departments: (data.partner_departments ?? []).map((row: { department: string }) => row.department)
  };
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
