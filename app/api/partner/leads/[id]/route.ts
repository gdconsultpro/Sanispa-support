import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { sanitizePartnerLead, sanitizeUnlockedPartnerLead } from "@/lib/partner-leads";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
      `
        id,
        created_at,
        status,
        request_type,
        problem_type,
        department,
        assigned_partner_id,
        lead_locked_until,
        matched_partner_ids,
        customers (
          name,
          phone,
          email,
          address,
          spa_brand,
          spa_model,
          spa_year
        ),
        diagnostic_answers (
          question_key,
          question_label,
          answer
        ),
        diagnostic_photos (
          photo_type,
          public_url
        )
      `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[partner-leads] Unable to load partner lead detail", {
      partnerId: partner.id,
      diagnosticId: id,
      error: error.message
    });
    return NextResponse.json({ error: "Chargement impossible." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Lead introuvable ou non disponible." }, { status: 404 });
  }

  if (data.request_type !== "TECHNICAL_REQUEST") {
    return NextResponse.json({ error: "Ce dossier n'est pas un lead technique." }, { status: 404 });
  }

  if (data.assigned_partner_id === partner.id) {
    const documents = await loadLeadDocuments(supabase, data.id);
    return NextResponse.json({ lead: sanitizeUnlockedPartnerLead(data, documents) });
  }

  if (data.assigned_partner_id) {
    return NextResponse.json({ error: "Ce dossier a déjà été débloqué par un autre partenaire." }, { status: 403 });
  }

  if (!Array.isArray(data.matched_partner_ids) || !data.matched_partner_ids.includes(partner.id)) {
    return NextResponse.json({ error: "Ce dossier n'est pas disponible pour votre compte partenaire." }, { status: 403 });
  }

  return NextResponse.json({ lead: sanitizePartnerLead(data) });
}

async function loadLeadDocuments(supabase: any, diagnosticId: string) {
  const { data } = await supabase
    .from("client_documents")
    .select("id, document_type, file_name, storage_bucket, storage_path")
    .eq("diagnostic_id", diagnosticId)
    .order("created_at", { ascending: false });

  const documents = await Promise.all(
    (data ?? []).map(async (document: any) => {
      const { data: signed } = await supabase.storage
        .from(document.storage_bucket)
        .createSignedUrl(document.storage_path, 60 * 30);

      return {
        id: document.id,
        name: document.file_name,
        type: document.document_type,
        url: signed?.signedUrl ?? null
      };
    })
  );

  return documents;
}
