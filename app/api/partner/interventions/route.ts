import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { apiError, HttpError } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const { partner, supabase } = await getAuthenticatedPartner(request);
    if (!partner) throw new HttpError(401, "Connexion partenaire requise.");
    const { data, error } = await supabase.from("diagnostics")
      .select("id,public_reference,problem_type,status,created_at,customers(name,address),partner_appointments(starts_at,ends_at),intervention_reports(id,client_validated_at,client_outcome,submitted_at,performed_at),invoices:client_documents(id)")
      .eq("assigned_partner_id", partner.id).is("archived_at", null)
      .eq("invoices.document_type", "Facture d’intervention").in("invoices.issued_by", ["partner", "sanispa"])
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ interventions: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
