import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDenied, administrator } from "@/lib/admin-auth";
import { apiError, HttpError, readJson } from "@/lib/http";

const billingSchema = z.object({ leads_paid: z.boolean() }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminDenied(request);
  if (denied) return denied;

  try {
    const { user, supabase } = await administrator(request.headers);
    const id = z.string().uuid().parse((await params).id);
    const payload = billingSchema.parse(await readJson(request, 1024));
    const { error: mutationError } = await supabase.rpc("set_partner_leads_paid", {
      p_partner: id,
      p_value: payload.leads_paid,
      p_actor: user.id
    });

    if (mutationError) {
      if (mutationError.message === "ADMIN_REQUIRED")
        throw new HttpError(403, "Votre compte ne dispose plus de l’accès administrateur nécessaire.");
      if (mutationError.message === "PARTNER_NOT_FOUND")
        throw new HttpError(404, "Partenaire introuvable. Actualisez la liste avant de réessayer.");
      if (mutationError.message === "INVALID_BILLING_SETTING")
        throw new HttpError(400, "Choisissez si les leads de ce partenaire sont payants, puis enregistrez.");
      throw mutationError;
    }

    const { data, error } = await supabase.from("partners")
      .select("*, partner_departments(department)").eq("id", id).single();
    if (error) throw error;
    if (!data || typeof data.leads_paid !== "boolean")
      throw new HttpError(503, "Le réglage actuel n’a pas pu être confirmé. Actualisez la liste des partenaires avant de réessayer.");

    return NextResponse.json({
      partner: {
        ...data,
        departments: (data.partner_departments ?? []).map((row: { department: string }) => row.department).sort()
      }
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
