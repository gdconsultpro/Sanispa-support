import { NextResponse } from "next/server";
import { z } from "zod";
import { getPhotoRequirements, isPhotoRequired, problemTypes, questionSets } from "@/lib/questions";
import { sendCustomerConfirmation, sendDiagnosticNotification } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ProblemType } from "@/lib/types";

const payloadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  address: z.string().min(1),
  spaBrand: z.string().min(1),
  spaModel: z.string().optional(),
  spaYear: z.string().min(1),
  installationType: z.enum(["interieur", "exterieur"]),
  powerSupply: z.enum(["230V", "400V", "je ne sais pas"]),
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

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        spa_brand: payload.spaBrand,
        spa_model: payload.spaModel || null,
        spa_year: payload.spaYear,
        installation_type: payload.installationType,
        power_supply: payload.powerSupply
      })
      .select("id")
      .single();

    if (customerError) throw customerError;

    const { data: diagnostic, error: diagnosticError } = await supabase
      .from("diagnostics")
      .insert({
        customer_id: customer.id,
        problem_type: payload.problemType,
        status: payload.choice === "intervention" ? "RDV demandé" : "nouvelle",
        choice: payload.choice,
        payment_plan: payload.paymentPlan || null
      })
      .select("id")
      .single();

    if (diagnosticError) throw diagnosticError;

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

    try {
      const emailPayload = {
        diagnosticId: diagnostic.id,
        customer: {
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          spaBrand: payload.spaBrand,
          spaModel: payload.spaModel || null,
          spaYear: payload.spaYear
        },
        problemType: payload.problemType,
        choice: payload.choice,
        paymentPlan: payload.paymentPlan || null,
        answers: answerRows.map((answer) => ({
          question_label: answer.question_label,
          answer: answer.answer
        })),
        photos: photoRows.map((photo) => ({
          photo_type: photo.photo_type,
          public_url: photo.public_url
        }))
      };

      await sendDiagnosticNotification(emailPayload);
      await sendCustomerConfirmation(emailPayload);
    } catch (emailError) {
      console.error(emailError);
    }

    return NextResponse.json({ diagnosticId: diagnostic.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
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
