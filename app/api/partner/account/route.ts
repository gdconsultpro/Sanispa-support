import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, HttpError, readJson } from "@/lib/http";
import { getAuthenticatedPartner } from "@/lib/partner-auth";

const privateResponse = { headers: { "Cache-Control": "private, no-store" } };
const accountChanges = z.object({
  address: z.string().trim().min(3).max(300).optional(),
  postal_code: z.string().trim().regex(/^\d{5}$/).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  email: z.string().trim().toLowerCase().max(254).email().optional(),
  siret: z.string().max(30).transform(value => value.replace(/\s/g, "")).pipe(z.string().regex(/^\d{14}$/)).optional(),
}).strict();

export async function GET(request: Request) {
  try {
    const { user, partner, supabase } = await getAuthenticatedPartner(request);
    if (!user || !partner) throw new HttpError(401, "Connexion partenaire requise.");
    const { data: company, error } = await supabase.from("partners")
      .select("company_name,contact_name,email,phone,address,postal_code,city,siret,verification_status")
      .eq("id", partner.id).eq("active", true).maybeSingle();
    if (error) throw error;
    if (!company) throw new HttpError(403, "Cette entreprise ne dispose plus d’un accès partenaire actif.");
    return NextResponse.json({ company, loginEmail: user.email, canEdit: partner.role === "owner" }, privateResponse);
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const { user, partner, supabase } = await getAuthenticatedPartner(request);
    if (!user || !partner) throw new HttpError(401, "Connexion partenaire requise.");
    if (partner.role !== "owner") throw new HttpError(403, "Seul le responsable de l’entreprise peut modifier ses coordonnées.");
    const changes = accountChanges.parse(await readJson(request, 4096));
    const { data, error } = await supabase.rpc("update_partner_account", {
      p_partner: partner.id,
      p_actor: user.id,
      p_changes: changes,
    });
    if (error?.message === "PARTNER_OWNER_REQUIRED") throw new HttpError(403, "Seul le responsable d’une entreprise active peut modifier ses coordonnées.");
    if (error?.message === "CONTACT_REQUIRED") throw new HttpError(400, "Complétez l’adresse, le téléphone et l’e-mail de contact avant de modifier le SIRET.");
    if (error?.code === "23505") throw new HttpError(409, "Cette adresse e-mail de contact est déjà utilisée par une autre entreprise.");
    if (error) throw error;
    return NextResponse.json({ ...data, loginEmail: user.email, canEdit: true }, privateResponse);
  } catch (error) { return apiError(error); }
}
