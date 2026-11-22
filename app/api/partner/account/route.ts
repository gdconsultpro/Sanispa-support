import { NextResponse } from "next/server";
import { apiError, HttpError } from "@/lib/http";
import { getAuthenticatedPartner } from "@/lib/partner-auth";

export async function GET(request: Request) {
  try {
    const { user, partner, supabase } = await getAuthenticatedPartner(request);
    if (!user || !partner) throw new HttpError(401, "Connexion partenaire requise.");
    const { data: company, error } = await supabase.from("partners")
      .select("company_name,contact_name,email,phone,address,postal_code,city,siret,verification_status")
      .eq("id", partner.id).eq("active", true).maybeSingle();
    if (error) throw error;
    if (!company) throw new HttpError(403, "Cette entreprise ne dispose plus d’un accès partenaire actif.");
    return NextResponse.json({ company, loginEmail: user.email }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
