import { getSupabaseAdmin } from "./supabase";
import { buildSummaryPdf } from "./pdf";
import { HttpError } from "./http";
export async function diagnosticPdf(id: string, userId?: string) {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("diagnostics").select("*, customers(*), diagnostic_answers(question_label,answer), diagnostic_photos(photo_type)").eq("id", id);
    if (userId)
        query = query.eq("user_id", userId);
    const { data, error } = await query.maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new HttpError(404, "Dossier introuvable.");
    const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
    const lines = [
        "SANISPA",
        "Resume de demande d'assistance SANISPA",
        "",
        `Numero dossier : ${data.id}`,
        `Date : ${new Date(data.created_at).toLocaleString("fr-FR")}`,
        `Statut : ${data.status}`,
        `Type de probleme : ${data.problem_type}`,
        `Prestation choisie : ${data.choice ?? "Non renseignee"}`,
        `Paiement : ${data.payment_status ?? "Non requis / non paye"}`,
        "",
        "Informations client",
        `Nom : ${customer?.name ?? ""}`,
        `Telephone : ${customer?.phone ?? ""}`,
        `Email : ${customer?.email ?? ""}`,
        `Adresse : ${customer?.address ?? ""}`,
        "",
        "Informations spa",
        `Marque : ${customer?.spa_brand ?? ""}`,
        `Modele : ${customer?.spa_model ?? ""}`,
        `Annee : ${customer?.spa_year ?? ""}`,
        `Installation : ${customer?.installation_type ?? ""}`,
        "",
        "Reponses au questionnaire",
        ...(data.diagnostic_answers ?? []).map((answer: {
            question_label: string;
            answer: string;
        }) => `${answer.question_label} : ${answer.answer}`),
        "",
        "Photos jointes",
        ...((data.diagnostic_photos ?? []).map((photo: {
            photo_type: string;
            public_url?: string;
        }) => `${photo.photo_type} : ${photo.public_url ?? "Photo stockee"}`)),
        "",
        "Ce document constitue un resume de demande d'assistance et ne constitue pas une facture."
    ];
    return buildSummaryPdf(lines);
}
