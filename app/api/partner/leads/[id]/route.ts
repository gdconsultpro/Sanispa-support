import { loadPartnerLeadBilling, billingFromPurchase, purchaseTermsColumns } from "@/lib/partner-billing";
import { canViewPartnerOffer } from "@/lib/partner-release";
import { apiError } from "@/lib/http";
import { protectedPhotos } from "@/lib/photos";
import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { partnerLeadStatuses, sanitizePartnerLead, sanitizeUnlockedPartnerLead } from "@/lib/partner-leads";
export async function GET(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
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
        .select(`
        id,
        created_at,
        choice,
        partner_released_at, partner_kept_at,
        status,
        request_type,
        archived_at,
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
          storage_path,
          public_url
        )
      `)
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
        data.diagnostic_photos = await protectedPhotos(supabase, data.diagnostic_photos);
        const documents = await loadLeadDocuments(supabase, data.id);
        const {data:purchase,error:purchaseError} = await supabase.from("lead_purchases").select(purchaseTermsColumns)
            .eq("request_id",id).eq("partner_id",partner.id).in("status",["paid","granted"]).order("purchased_at",{ascending:false}).limit(1).maybeSingle();
        if (purchaseError) throw purchaseError;
        const lead = sanitizeUnlockedPartnerLead(data, documents);
        if (purchase) lead.billing = billingFromPurchase(purchase);
        return NextResponse.json({ lead }, {headers:{"Cache-Control":"private, no-store"}});
    }
    if (data.assigned_partner_id) {
        return NextResponse.json({ error: "Ce dossier a déjà été débloqué par un autre partenaire." }, { status: 403 });
    }
    if (!Array.isArray(data.matched_partner_ids) || !data.matched_partner_ids.includes(partner.id)) {
        return NextResponse.json({ error: "Ce dossier n'est pas disponible pour votre compte partenaire." }, { status: 403 });
    }
    if (data.archived_at || !partnerLeadStatuses.includes(data.status))
        return NextResponse.json({error:"Ce dossier n’est plus disponible à la prise en charge."},{status:403});
    const states = await loadPartnerLeadBilling(supabase,partner,[id]);
    const state = states.get(id)!;
    if (!canViewPartnerOffer(data, partner.id, state.ownReservation))
        return NextResponse.json({error:"Cette intervention n’est pas disponible pour votre compte : elle doit être validée par SANISPA et confiée à un partenaire sélectionné."},{status:403});
    const lead = sanitizePartnerLead(data,state.billing);
    lead.canUnlock = !state.reservedElsewhere && (lead.canUnlock || state.ownReservation) && state.billing.available;
    return NextResponse.json({ lead },{headers:{"Cache-Control":"private, no-store"}});
    } catch (error) { return apiError(error); }
}
async function loadLeadDocuments(supabase: any, diagnosticId: string) {
    const { data } = await supabase
        .from("client_documents")
        .select("id, document_type, file_name, storage_bucket, storage_path")
        .eq("diagnostic_id", diagnosticId)
        .order("created_at", { ascending: false });
    const documents = await Promise.all((data ?? []).map(async (document: any) => {
        return {
            id: document.id,
            name: document.file_name,
            type: document.document_type,
            url: `/api/files/document?id=${document.id}`
        };
    }));
    return documents;
}
