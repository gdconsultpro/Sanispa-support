import { NextResponse } from "next/server";
import { z } from "zod";
import { getPhotoRequirements, isPhotoRequired, problemTypes, questionSets } from "@/lib/questions";
import { sendCustomerConfirmation, sendDiagnosticNotification } from "@/lib/email";
import { getDepartmentFromPostalCode } from "@/lib/partners";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ProblemType } from "@/lib/types";

const payloadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  spaBrand: z.string().optional(),
  spaModel: z.string().optional(),
  spaYear: z.string().optional().default(""),
  installationType: z.enum(["interieur", "exterieur"]),
  powerSupply: z.enum(["230V", "400V", "je ne sais pas", ""]).optional(),
  problemType: z.enum(problemTypes.map((item) => item.value) as [string, ...string[]]),
  answers: z.record(z.string()).default({}),
  photos: z.record(z.string()).default({}),
  choice: z.enum(["intervention", "devis", "remote"]),
  paymentPlan: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const photoRequirements = getPhotoRequirements(payload.problemType as ProblemType);
    const missingPhoto = photoRequirements.some((photo) => isPhotoRequired(photo.id, payload.problemType as ProblemType) && !payload.photos[photo.id]);
    if (missingPhoto) {
      return NextResponse.json({ error: "La photo du clavier est obligatoire pour une panne électrique." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const addressParts = [payload.address, payload.postalCode, payload.city].filter(Boolean);
    const customerAddress = addressParts.join(" - ");
    const answerPowerSupply = payload.answers.power_supply_known;
    const powerSupply = answerPowerSupply === "Je ne sais pas" ? "je ne sais pas" : payload.powerSupply || answerPowerSupply || "je ne sais pas";
    const isWaterAnalysis = payload.problemType === "traitement-eau" && payload.choice === "remote" && payload.paymentPlan === "water";
    const isArchivedRemotePlan = payload.choice === "remote" && payload.paymentPlan !== "water";

    if (isArchivedRemotePlan) {
      return NextResponse.json({ error: "Cette formule d'assistance n'est plus proposée. Les demandes techniques sont gratuites." }, { status: 400 });
    }

    if (payload.problemType === "traitement-eau" && payload.choice === "remote" && payload.paymentPlan !== "water") {
      return NextResponse.json({ error: "Veuillez sélectionner le diagnostic IA traitement d'eau." }, { status: 400 });
    }

    const department = getDepartmentFromPostalCode(payload.postalCode);
    const matchedPartnerIds = isWaterAnalysis ? [] : await findPartnerIdsForDepartment(supabase, department);

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        address: customerAddress,
        spa_brand: payload.spaBrand || "Non renseignée",
        spa_model: payload.spaModel || null,
        spa_year: payload.spaYear || "Non renseignée",
        installation_type: payload.installationType,
        power_supply: powerSupply
      })
      .select("id")
      .single();

    if (customerError) throw customerError;

    const { data: diagnostic, error: diagnosticError } = await supabase
      .from("diagnostics")
      .insert({
        customer_id: customer.id,
        problem_type: payload.problemType,
        request_type: isWaterAnalysis ? "WATER_ANALYSIS" : "TECHNICAL_REQUEST",
        department,
        matched_partner_ids: matchedPartnerIds,
        status: isWaterAnalysis ? "WATER_ANALYSIS" : "AVAILABLE",
        choice: payload.choice,
        payment_plan: isWaterAnalysis ? "water" : null
      })
      .select("id")
      .single();

    if (diagnosticError) throw diagnosticError;
    console.log("[SANISPA diagnostic] dossier créé", { diagnosticId: diagnostic.id, email: payload.email });

    const problemType = payload.problemType as ProblemType;
    const questions = questionSets[problemType];
    const answerRows = questions
      .filter((question) => payload.answers[question.id])
      .map((question) => ({
        diagnostic_id: diagnostic.id,
        question_key: question.id,
        question_label: question.label,
        answer: payload.answers[question.id]
      }));

    if (answerRows.length) {
      const { error: answersError } = await supabase.from("diagnostic_answers").insert(answerRows);
      if (answersError) throw answersError;
    }

    const photoRows = [];
    for (const photo of photoRequirements) {
      const dataUrl = payload.photos[photo.id];
      if (!dataUrl) continue;
      const upload = decodeDataUrl(dataUrl);
      const path = `${diagnostic.id}/${photo.id}-${Date.now()}.${upload.extension}`;
      const { error: uploadError } = await supabase.storage.from("diagnostic-photos").upload(path, upload.buffer, {
        contentType: upload.contentType,
        upsert: true
      });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from("diagnostic-photos").getPublicUrl(path);
      photoRows.push({
        diagnostic_id: diagnostic.id,
        photo_type: photo.id,
        storage_path: path,
        public_url: publicData.publicUrl
      });
    }

    if (photoRows.length) {
      const { error: photosError } = await supabase.from("diagnostic_photos").insert(photoRows);
      if (photosError) throw photosError;
    }

    const emailPayload = {
      diagnosticId: diagnostic.id,
      customer: {
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        address: customerAddress,
        spaBrand: payload.spaBrand || "Non renseignée",
        spaModel: payload.spaModel || null,
        spaYear: payload.spaYear
      },
      problemType: payload.problemType,
      choice: payload.choice,
      paymentPlan: isWaterAnalysis ? "water" : null,
      status: payload.choice === "remote" ? "En attente de paiement" : "Demande enregistrée",
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      dossierUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/espace-client`,
      summaryPdfUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/espace-client`,
      answers: answerRows.map((answer) => ({
        question_label: answer.question_label,
        answer: answer.answer
      })),
      photos: photoRows.map((photo) => ({
        photo_type: photo.photo_type,
        public_url: photo.public_url
      }))
    };

    try {
      await sendDiagnosticNotification(emailPayload);
    } catch (adminEmailError) {
      console.error("[SANISPA email admin] erreur notification admin", adminEmailError);
    }

    let customerEmailSent = false;
    let customerEmailError: string | null = null;

    if (isWaterAnalysis) {
      await supabase
        .from("diagnostics")
        .update({ customer_email_status: "pending_payment", customer_email_error: null })
        .eq("id", diagnostic.id);
    } else {
      try {
        console.log("[SANISPA email client] appel confirmation client après dossier", {
          diagnosticId: diagnostic.id,
          to: payload.email,
          choice: payload.choice
        });
        await sendCustomerConfirmation(emailPayload);
        customerEmailSent = true;
        await supabase
          .from("diagnostics")
          .update({ customer_email_status: "sent", customer_email_error: null })
          .eq("id", diagnostic.id);
      } catch (emailError) {
        customerEmailError = emailError instanceof Error ? emailError.message : "Erreur email client";
        await supabase
          .from("diagnostics")
          .update({ customer_email_status: "error", customer_email_error: customerEmailError })
          .eq("id", diagnostic.id);
      }
    }

    return NextResponse.json({ diagnosticId: diagnostic.id, customerEmailSent, customerEmailError });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function findPartnerIdsForDepartment(supabase: any, department: string) {
  if (!department) return [];

  const { data, error } = await supabase
    .from("partner_departments")
    .select("partner_id, partners!inner(active)")
    .eq("department", department)
    .eq("partners.active", true);

  if (error) {
    console.error("[SANISPA partners] impossible de charger les partenaires du département", { department, error });
    return [];
  }

  return Array.from(new Set((data ?? []).map((row: any) => row.partner_id).filter(Boolean)));
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Format photo invalide.");
  const contentType = match[1];
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return {
    contentType,
    extension,
    buffer: Buffer.from(match[2], "base64")
  };
}
