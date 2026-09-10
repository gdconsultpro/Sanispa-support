import { getSupabaseAdmin } from "./supabase";
import { buildSummaryPdf } from "./pdf";
import { HttpError } from "./http";
import { choiceLabel, installationLabel, paymentLabel, photoLabel, problemLabel, statusLabel } from "./display-labels";
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
        "Résumé de demande d'assistance SANISPA",
        "",
        `Numéro de dossier : ${data.id}`,
        `Date : ${new Date(data.created_at).toLocaleString("fr-FR")}`,
        `Statut : ${statusLabel(data.status)}`,
        `Type de problème : ${problemLabel(data.problem_type)}`,
        `Option choisie : ${choiceLabel(data.choice)}`,
        `Paiement : ${paymentLabel(data.payment_status, data.choice)}`,
        "",
        "Informations client",
        `Nom : ${customer?.name ?? ""}`,
        `Téléphone : ${customer?.phone ?? ""}`,
        `E-mail : ${customer?.email ?? ""}`,
        `Adresse : ${customer?.address ?? ""}`,
        "",
        "Informations spa",
        `Marque : ${customer?.spa_brand ?? ""}`,
        `Modèle : ${customer?.spa_model || "Non renseigné"}`,
        `Année : ${customer?.spa_year || "Non renseignée"}`,
        `Installation : ${installationLabel(customer?.installation_type)}`,
        "",
        "Réponses au questionnaire",
        ...(data.diagnostic_answers ?? []).map((answer: {
            question_label: string;
            answer: string;
        }) => `${answer.question_label} : ${answer.answer}`),
        "",
        "Photos jointes",
        ...((data.diagnostic_photos ?? []).map((photo: {
            photo_type: string;
            public_url?: string;
        }) => `${photoLabel(photo.photo_type)} : photo jointe au dossier`)),
        "",
        "Ce document constitue un résumé de demande d'assistance et ne constitue pas une facture."
    ];
    return buildSummaryPdf(lines);
}
