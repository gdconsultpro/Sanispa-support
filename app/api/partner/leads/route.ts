import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { partnerLeadStatuses, sanitizePartnerLead } from "@/lib/partner-leads";

export async function GET(request: Request) {
  const { user, partner, supabase } = await getAuthenticatedPartner(request);

  if (!user) {
    return NextResponse.json({ error: "Connexion partenaire requise." }, { status: 401 });
  }

  if (!partner) {
    return NextResponse.json({ error: "Aucun accès partenaire actif n'est associé à ce compte." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("diagnostics")
    .select(
      "id, created_at, problem_type, department, customers(spa_brand, spa_model, address), diagnostic_answers(question_key, answer)"
    )
    .eq("request_type", "TECHNICAL_REQUEST")
    .in("status", partnerLeadStatuses)
    .is("assigned_partner_id", null)
    .contains("matched_partner_ids", [partner.id])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[partner-leads] Unable to load partner leads", {
      partnerId: partner.id,
      error: error.message
    });
    return NextResponse.json({ error: "Chargement impossible." }, { status: 500 });
  }

  return NextResponse.json({ leads: (data ?? []).map(sanitizePartnerLead) });
}
