import { loadPartnerLeadBilling } from "@/lib/partner-billing";
import { apiError } from "@/lib/http";
import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { partnerLeadStatuses, sanitizePartnerLead } from "@/lib/partner-leads";

export async function GET(request: Request) {
  try {
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
      "id, created_at, problem_type, department, assigned_partner_id, lead_locked_until, customers(spa_brand, spa_model, address), diagnostic_answers(question_key, answer)"
    )
    .eq("request_type", "TECHNICAL_REQUEST")
    .in("status", partnerLeadStatuses)
    .is("assigned_partner_id", null)
    .is("archived_at", null)
    .contains("matched_partner_ids", [partner.id])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[partner-leads] Unable to load partner leads", {
      partnerId: partner.id,
      error: error.message
    });
    return NextResponse.json({ error: "Chargement impossible." }, { status: 500 });
  }

  const billingStates = await loadPartnerLeadBilling(supabase, partner, (data ?? []).map(row => row.id));
  const leads = (data ?? []).map(row => {
    const state = billingStates.get(row.id)!;
    const lead = sanitizePartnerLead(row, state.billing);
    lead.canUnlock = !state.reservedElsewhere && (lead.canUnlock || state.ownReservation) && state.billing.available;
    return lead;
  });
  return NextResponse.json({ leads }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
