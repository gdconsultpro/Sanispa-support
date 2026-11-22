import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { problemLabel } from "@/lib/display-labels";
import { validateDocument } from "@/lib/documents";
import { apiError, HttpError, readBytes, readJson } from "@/lib/http";
import { interventionError, reportSchema } from "@/lib/interventions";
import { processNotifications } from "@/lib/notifications";
import { requirePartnerPlanner } from "@/lib/partner-auth";
import type { FieldReport, FieldVisit } from "@/lib/partner-field";
import { fieldPhotoBucket, fieldPhotoPath, loadFieldPhotos } from "@/lib/partner-field-photos";
import { partnerClientAddress } from "@/lib/partner-planner";
import { privateWorkStatus, sanispaWorkStatus } from "@/lib/partner-workspace";

type Context = { params: Promise<{ source: string; id: string }> };
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const headers = { "Cache-Control": "private, no-store" };
const fieldCommands = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  reportSchema.extend({ session: uuid }),
  z.object({ action: z.literal("validate"), version: timestamp }).strict(),
  z.object({ action: z.literal("spa"), spaId: uuid.nullable(), version: timestamp }).strict(),
]);
const spaFields = "id,brand,model,serial_number,updated_at";
const sessions = "id,started_at,appointment_start,report_id,submitted_at,performed_at,findings,actions,next_steps";

async function fieldCase(request: Request, context: Context) {
  const { partner, supabase, user } = await requirePartnerPlanner(request);
  const { source, id } = z.object({ source: z.enum(["private", "sanispa"]), id: uuid }).parse(await context.params);
  if (source === "private") {
    const { data: visit, error } = await supabase.from("partner_private_visits")
      .select("id,client_id,title,description,spa_id,starts_at,ends_at,field_started_at,completed_at,validated_at,updated_at,client:partner_private_clients!inner(name,phone,street,postal_code,city,deleted_at)")
      .eq("partner_id", partner.id).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!visit) throw new HttpError(404, "Cette intervention est introuvable.");
    return { source, id, partner, user, supabase, visit } as const;
  }
  const { data: dossier, error } = await supabase.from("diagnostics")
    .select("id,public_reference,problem_type,preview_description,status,intervened_at,created_at,customers(name,phone,address,spa_brand,spa_model),diagnostic_answers(question_key,answer)")
    .eq("assigned_partner_id", partner.id).eq("id", id).is("archived_at", null)
    .in("diagnostic_answers.question_key", ["description", "noise_description", "pump_details"]).maybeSingle();
  if (error) throw error;
  if (!dossier) throw new HttpError(404, "Ce dossier SANISPA est introuvable.");
  return { source, id, partner, user, supabase, dossier } as const;
}

function fieldError(error: { message?: string }) {
  switch (error.message) {
    case "FIELD_NOT_FOUND": return new HttpError(404, "Cette intervention est introuvable.");
    case "FIELD_ACCESS_REQUIRED": return new HttpError(403, "Cette intervention n’est pas accessible à votre compte.");
    case "FIELD_APPOINTMENT_REQUIRED": return new HttpError(409, "Planifiez d’abord le rendez-vous.");
    case "FIELD_TOO_EARLY": return new HttpError(409, "Le démarrage sera disponible à l’heure prévue du rendez-vous.");
    case "FIELD_ALREADY_FINISHED": return new HttpError(409, "Cette intervention est déjà terminée. Actualisez la fiche.");
    case "FIELD_PHOTO_LIMIT": return new HttpError(409, "Vous pouvez joindre jusqu’à 12 photos par intervention.");
    case "PARTNER_WORK_ROLE_REQUIRED": return new HttpError(403, "La validation est réservée au responsable de l’entreprise.");
    case "PARTNER_VISIT_STATE_CHANGED": return new HttpError(409, "L’intervention a évolué. Actualisez la fiche.");
    case "INVALID_FIELD_REPORT": return new HttpError(400, "Vérifiez la date et les trois réponses du compte rendu.");
    default: return interventionError(error);
  }
}

async function ownSession(field: Awaited<ReturnType<typeof fieldCase>>, id: string) {
  const { data, error } = await field.supabase.from("partner_field_sessions").select("id,submitted_at")
    .eq("partner_id", field.partner.id).eq("id", id)
    .eq(field.source === "private" ? "private_visit_id" : "diagnostic_id", field.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Cette intervention est introuvable.");
  return data;
}

export async function GET(request: Request, context: Context) {
  try {
    const field = await fieldCase(request, context);
    const { supabase, partner, id } = field;
    const sessionResult = supabase.from("partner_field_sessions").select(sessions).eq("partner_id", partner.id)
      .eq(field.source === "private" ? "private_visit_id" : "diagnostic_id", id)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    const now = Date.now();
    let result: FieldVisit;
    if (field.source === "private") {
      const visit = field.visit;
      const [last, equipment] = await Promise.all([sessionResult, supabase.from("partner_client_spas").select(spaFields)
        .eq("partner_id", partner.id).eq("client_id", visit.client_id).order("brand").order("model")]);
      if (last.error || equipment.error) throw last.error || equipment.error;
      const session = last.data;
      const client = Array.isArray(visit.client) ? visit.client[0] : visit.client;
      const workStatus = privateWorkStatus(visit, now);
      const reports: FieldReport[] = session?.report_id ? [{
        id: session.report_id, performed_at: session.performed_at, submitted_at: session.submitted_at,
        findings: session.findings, actions: session.actions, next_steps: session.next_steps,
      }] : [];
      result = {
        title: visit.title, description: visit.description, workStatus, version: visit.updated_at,
        customer: { name: client.name, phone: client.phone, address: partnerClientAddress(client), clientId: client.deleted_at ? null : visit.client_id },
        appointment: visit.starts_at && visit.ends_at ? { starts_at: visit.starts_at, ends_at: visit.ends_at } : null,
        session, photos: session ? await loadFieldPhotos(supabase, partner.id, session.id) : [], reports,
        spaId: visit.spa_id, spas: equipment.data,
        canStart: !session && !visit.completed_at && Boolean(visit.starts_at && Date.parse(visit.starts_at) <= now),
        canValidate: partner.role === "owner" && workStatus === "review", canEditSpa: !visit.completed_at,
      };
    } else {
      const { dossier } = field;
      const [last, appointmentResult, reportResult, contact] = await Promise.all([
        sessionResult,
        supabase.from("partner_appointments").select("diagnostic_id,starts_at,ends_at,technician_id,updated_at")
          .eq("diagnostic_id", id).eq("partner_id", partner.id).maybeSingle(),
        supabase.from("intervention_reports").select("id,performed_at,submitted_at,findings,actions,next_steps,client_validated_at,client_outcome")
          .eq("diagnostic_id", id).eq("partner_id", partner.id).order("submitted_at", { ascending: false }),
        supabase.from("partner_private_clients").select("id").eq("partner_id", partner.id)
          .eq("source_diagnostic_id", id).is("deleted_at", null).maybeSingle(),
      ]);
      if (last.error || appointmentResult.error || reportResult.error || contact.error)
        throw last.error || appointmentResult.error || reportResult.error || contact.error;
      const appointment = appointmentResult.data ?? undefined;
      const reports = reportResult.data;
      const session = last.data && (last.data.submitted_at === null || !appointment || last.data.appointment_start === appointment.starts_at) ? last.data : null;
      const clientId = contact.data?.id;
      const [equipment, link] = clientId ? await Promise.all([
        supabase.from("partner_client_spas").select(spaFields).eq("partner_id", partner.id).eq("client_id", clientId).order("brand").order("model"),
        supabase.from("partner_client_spa_dossiers").select("spa_id").eq("partner_id", partner.id).eq("client_id", clientId).eq("diagnostic_id", id).maybeSingle(),
      ]) : [null, null];
      if (equipment?.error || link?.error) throw equipment?.error || link?.error;
      const customer = Array.isArray(dossier.customers) ? dossier.customers[0] : dossier.customers;
      const reportState = { ...dossier, customer, intervention_reports: reports, partner_field_sessions: session ? [session] : [] };
      const { workStatus } = sanispaWorkStatus(reportState, appointment ? { ...appointment, diagnostic: reportState } : undefined, now);
      result = {
        title: problemLabel(dossier.problem_type), reference: dossier.public_reference,
        description: dossier.preview_description?.trim() || dossier.diagnostic_answers.map(answer => answer.answer).filter(Boolean).join("\n"),
        customer: { name: customer?.name || "Client", phone: customer?.phone, address: customer?.address, clientId },
        appointment: appointment ?? null, session, photos: session ? await loadFieldPhotos(supabase, partner.id, session.id) : [],
        workStatus, reports, spaId: link?.data?.spa_id ?? null, spas: equipment?.data ?? [],
        declaredSpa: [customer?.spa_brand, customer?.spa_model].filter(Boolean).join(" "),
        canStart: !session && Boolean(appointment && Date.parse(appointment.starts_at) <= now) && (workStatus === "scheduled" || workStatus === "due"),
        canValidate: false, canEditSpa: Boolean(clientId) && (["pending", "scheduled", "due", "in_progress"].includes(workStatus)),
      };
    }
    return NextResponse.json({ ...result, userId: field.user.id }, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const field = await fieldCase(request, context);
    const { partner, supabase, user, source, id } = field;
    const command = fieldCommands.parse(await readJson(request, 22000));
    const actor = { p_partner: partner.id, p_actor: user.id };
    await rateLimit(supabase, `partner-field:${partner.id}`, 30);
    if (command.action === "start") {
      const { error } = await supabase.rpc("start_partner_field_visit", { ...actor, p_source: source, p_id: id });
      if (error) throw fieldError(error);
    } else if (command.action === "report") {
      await ownSession(field, command.session);
      const { error } = await supabase.rpc("submit_partner_field_report", {
        ...actor, p_session: command.session, p_report: command.id, p_performed: command.performedAt,
        p_findings: command.findings, p_actions: command.actions, p_next: command.nextSteps,
      });
      if (error) throw fieldError(error);
      if (source === "sanispa") {
        try { await processNotifications(`report:${command.id}`); }
        catch { console.error("Notification du compte rendu à relancer."); }
      }
    } else {
      if (field.source !== "private") throw new HttpError(400, "Cette action est réservée aux interventions privées.");
      if (command.action === "validate") {
        const { error } = await supabase.rpc("advance_partner_private_visit", {
          ...actor, p_visit: id, p_expected: command.version, p_validate: true,
        });
        if (error) throw fieldError(error);
      } else {
        const { data, error } = await supabase.from("partner_private_visits").update({ spa_id: command.spaId, updated_at: new Date().toISOString() })
          .eq("partner_id", partner.id).eq("id", id).eq("updated_at", command.version).is("completed_at", null).select("id").maybeSingle();
        if (error?.code === "23503") throw new HttpError(400, "Choisissez un spa de cette fiche client.");
        if (error) throw error;
        if (!data) throw new HttpError(409, "La fiche a évolué. Actualisez-la avant de modifier le spa.");
      }
    }
    return NextResponse.json({ saved: true }, { headers });
  } catch (error) { return apiError(error); }
}

async function changePhoto(request: Request, context: Context, remove: boolean) {
  const field = await fieldCase(request, context);
  const { partner, supabase, user } = field;
  const params = new URL(request.url).searchParams;
  const session = await ownSession(field, uuid.parse(params.get("session")));
  const photo = uuid.parse(params.get("photo"));
  if (session.submitted_at) throw new HttpError(409, "Le compte rendu a déjà été transmis.");
  await rateLimit(supabase, `partner-field-photo:${partner.id}`, 45);
  const storage = supabase.storage.from(fieldPhotoBucket);
  const path = fieldPhotoPath(partner.id, session.id, photo);
  let created = false;
  if (!remove) {
    if (request.headers.get("content-type") !== "image/jpeg") throw new HttpError(415, "Choisissez une photo JPG.");
    const bytes = await readBytes(request, 512 * 1024);
    validateDocument("photo.jpg", "image/jpeg", bytes);
    const uploaded = await storage.upload(path, bytes, { contentType: "image/jpeg", cacheControl: "0", upsert: false });
    const uploadStatus = uploaded.error as { statusCode?: string } | null;
    if (uploaded.error && !(/exist|duplicate/i.test(uploaded.error.message) &&
      ["400", "409"].includes(String(uploadStatus?.statusCode)))) throw uploaded.error;
    created = !uploaded.error;
  }
  const { error } = await supabase.rpc("change_partner_field_photo", {
    p_partner: partner.id, p_actor: user.id, p_session: session.id, p_photo: photo, p_remove: remove,
  });
  if (error) {
    if (created) {
      const existing = await supabase.from("partner_field_photos").select("id").eq("session_id", session.id).eq("id", photo).maybeSingle();
      if (!existing.error && !existing.data) await storage.remove([path]);
    }
    throw fieldError(error);
  }
  if (remove) await storage.remove([path]);
  return NextResponse.json({ saved: true }, { headers });
}

export async function PUT(request: Request, context: Context) {
  try { return await changePhoto(request, context, false); } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { return await changePhoto(request, context, true); } catch (error) { return apiError(error); }
}
