import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { problemLabel } from "@/lib/display-labels";
import { validateDocument } from "@/lib/documents";
import { apiError, HttpError, readBytes, readJson } from "@/lib/http";
import { interventionError, reportSchema } from "@/lib/interventions";
import { processNotifications } from "@/lib/notifications";
import { hasPartnerAppointment, requirePartnerPlanner } from "@/lib/partner-auth";
import { deliverFieldReport } from "@/lib/partner-field-delivery";
import { fieldReportFilename, type FieldReport, type FieldVisit } from "@/lib/partner-field";
import { emptyFieldNextSteps, fieldChoices, fieldForms, fieldPhotoKinds, fieldReportRows, fieldTemplate, requiredFieldPhotos,
  type FieldReportDetails } from "@/lib/partner-field-forms";
import { fieldPhotoBucket, fieldPhotoPath, loadFieldPhotos } from "@/lib/partner-field-photos";
import { buildFieldReportPdf, customerSignature } from "@/lib/partner-field-pdf";
import { partnerClientAddress, partnerSpaOption } from "@/lib/partner-planner";
import { privateWorkStatus, sanispaWorkStatus } from "@/lib/partner-workspace";
import type { AppointmentUnplanning } from "@/lib/partner-unplanning";
import { stockSearchFilter } from "@/lib/partner-stock-movements";

type Context = { params: Promise<{ source: string; id: string }> };
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const emailAddress = z.string().trim().max(254).email();
const headers = { "Cache-Control": "private, no-store" };
const fieldCommands = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  reportSchema.extend({ session: uuid, details: z.record(z.string().max(5000)).optional(), signature: customerSignature.optional(),
    findings: z.string().trim().max(5000), actions: z.string().trim().max(5000), nextSteps: z.string().trim().max(3000) }),
  z.object({ action: z.literal("validate"), version: timestamp }).strict(),
  z.object({ action: z.literal("followup"), reportId: uuid }).strict(),
  z.object({ action: z.literal("sendPdf"), reportId: uuid, expectedEmail: emailAddress }).strict(),
  z.object({ action: z.literal("stockUsage"), session: uuid, stockId: uuid, operation: uuid,
    quantity: z.number().int().min(0).max(1000000), expected: z.number().int().min(0).max(1000000) }).strict(),
  z.object({ action: z.literal("spa"), spaId: uuid.nullable(), version: timestamp }).strict(),
]);
const spaFields = "id,brand,model,serial_number,updated_at";
const sessions = "id,started_at,started_by,appointment_start,report_id,submitted_at,performed_at,findings,actions,next_steps,report_details,customer_signer:customer_signature->>name";

async function fieldCase(request: Request, context: Context) {
  const { partner, supabase, user, technicianId } = await requirePartnerPlanner(request);
  const { source, id } = z.object({ source: z.enum(["private", "sanispa"]), id: uuid }).parse(await context.params);
  if (source === "private") {
    let query = supabase.from("partner_private_visits")
      .select("id,client_id,title,description,spa_id,starts_at,ends_at,field_started_at,completed_at,validated_at,updated_at,previous_report,unplanned_appointments,client:partner_private_clients!inner(name,email,phone,street,postal_code,city,deleted_at)")
      .eq("partner_id", partner.id).eq("id", id);
    if (partner.role !== "owner") {
      if (!technicianId) throw fieldError({ message: "FIELD_NOT_FOUND" });
      query = query.eq("technician_id", technicianId).not("starts_at", "is", null);
    }
    const { data: visit, error } = await query.maybeSingle();
    if (error) throw error;
    if (!visit) throw new HttpError(404, "Cette intervention est introuvable.");
    return { source, id, partner, user, supabase, technicianId, visit, template: fieldTemplate(source, visit.title) } as const;
  }
  if (partner.role !== "owner" && !(await hasPartnerAppointment(supabase, partner.id, id, technicianId)))
    throw fieldError({ message: "FIELD_NOT_FOUND" });
  const { data: dossier, error } = await supabase.from("diagnostics")
    .select("id,user_id,public_reference,problem_type,preview_description,status,intervened_at,created_at,customers(name,email,phone,address,spa_brand,spa_model),diagnostic_answers(question_key,answer)")
    .eq("assigned_partner_id", partner.id).eq("id", id).is("archived_at", null)
    .in("diagnostic_answers.question_key", ["description", "noise_description", "pump_details"]).maybeSingle();
  if (error) throw error;
  if (!dossier) throw new HttpError(404, "Ce dossier SANISPA est introuvable.");
  return { source, id, partner, user, supabase, technicianId, dossier, template: fieldTemplate(source, dossier.problem_type) } as const;
}

function fieldError(error: { message?: string }) {
  switch (error.message) {
    case "FIELD_NOT_FOUND": return new HttpError(404, "Cette intervention est introuvable.");
    case "FIELD_ACCESS_REQUIRED": return new HttpError(403, "Cette intervention n’est pas accessible à votre compte.");
    case "FIELD_APPOINTMENT_REQUIRED": return new HttpError(409, "Planifiez d’abord le rendez-vous.");
    case "FIELD_TOO_EARLY": return new HttpError(409, "Le démarrage sera disponible à l’heure prévue du rendez-vous.");
    case "FIELD_ALREADY_FINISHED": return new HttpError(409, "Cette intervention est déjà terminée. Actualisez la fiche.");
    case "STOCK_NOT_FOUND": return new HttpError(404, "Cette pièce est introuvable dans votre stock.");
    case "STOCK_INSUFFICIENT": return new HttpError(409, "La quantité demandée dépasse le stock disponible.");
    case "STOCK_USAGE_CHANGED":
    case "STOCK_CHANGED": return new HttpError(409, "La quantité a changé. Vérifiez les pièces utilisées et réessayez.");
    case "STOCK_INVALID_QUANTITY": return new HttpError(400, "Indiquez une quantité compatible avec le stock.");
    case "FIELD_PHOTO_LIMIT": return new HttpError(409, "Vous pouvez joindre jusqu’à 12 photos par intervention.");
    case "FIELD_RECEIPT_EXISTS": return new HttpError(409, "Retirez le justificatif actuel avant de le remplacer.");
    case "FIELD_REQUIRED_PHOTOS": return new HttpError(400, "Ajoutez les photos obligatoires avant de valider le compte rendu.");
    case "FIELD_INVALID_SIGNATURE": return new HttpError(400, "Vérifiez le nom du signataire et recommencez la signature.");
    case "PARTNER_WORK_ROLE_REQUIRED": return new HttpError(403, "Demandez au technicien qui a démarré l’intervention de valider le compte rendu.");
    case "PARTNER_VISIT_STATE_CHANGED": return new HttpError(409, "L’intervention a évolué. Actualisez la fiche.");
    case "INVALID_FIELD_REPORT": return new HttpError(400, "Vérifiez la date et les trois réponses du compte rendu.");
    case "FIELD_REPORT_NOT_FOUND": return new HttpError(404, "Compte rendu introuvable.");
    case "FIELD_CLIENT_REQUIRED": return new HttpError(409, "Rétablissez la fiche client dans votre carnet pour prévoir une nouvelle intervention.");
    case "FIELD_ADDRESS_REQUIRED": return new HttpError(409, "Complétez l’adresse dans la fiche client pour prévoir une nouvelle intervention.");
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

type FieldCase = Awaited<ReturnType<typeof fieldCase>>;

function reportMayBeEmailed(source: FieldCase["source"], result: FieldVisit, report: FieldReport) {
  return Boolean(report.customerSigner && (source === "sanispa" || result.workStatus === "validated"));
}

async function fieldReportRecipient(field: FieldCase) {
  if (field.source === "private") {
    const contact = Array.isArray(field.visit.client) ? field.visit.client[0] : field.visit.client;
    return contact?.deleted_at ? null : emailAddress.safeParse(contact?.email).data ?? null;
  }
  if (field.dossier.user_id) {
    const { data, error } = await field.supabase.auth.admin.getUserById(field.dossier.user_id);
    if (error && error.status !== 404) throw error;
    const user = data?.user;
    if (!user?.email_confirmed_at || (user.banned_until && Date.parse(user.banned_until) > Date.now())) return null;
    return emailAddress.safeParse(user.email).data ?? null;
  }
  const contact = Array.isArray(field.dossier.customers) ? field.dossier.customers[0] : field.dossier.customers;
  return emailAddress.safeParse(contact?.email).data ?? null;
}

function fieldPhotoEndpoint(field: FieldCase, sessionId: string) {
  return `/api/partner/field/${field.source}/${field.id}?session=${sessionId}&photo=`;
}

async function loadFieldVisit(field: FieldCase, includePhotos: boolean): Promise<FieldVisit> {
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
      findings: session.findings, actions: session.actions, next_steps: session.next_steps, details: session.report_details,
      customerSigner: session.customer_signer,
    }] : [];
    result = {
      title: visit.title, description: visit.description, workStatus, version: visit.updated_at,
      customer: { name: client.name, phone: client.phone, address: partnerClientAddress(client), clientId: client.deleted_at ? null : visit.client_id },
      appointment: visit.starts_at && visit.ends_at ? { starts_at: visit.starts_at, ends_at: visit.ends_at } : null,
      session: session && { id: session.id, started_at: session.started_at, submitted_at: session.submitted_at },
      photos: session && includePhotos ? await loadFieldPhotos(supabase, partner.id, session.id, true, fieldPhotoEndpoint(field, session.id)) : [], reports, previousReport: visit.previous_report,
      spaId: visit.spa_id, spas: equipment.data,
      unplannedAppointments: partner.role === "owner" ? visit.unplanned_appointments as AppointmentUnplanning[] : undefined,
      canStart: !session && !visit.completed_at && Boolean(visit.starts_at && Date.parse(visit.starts_at) <= now),
      canValidate: workStatus === "review" && (partner.role === "owner" || Boolean(session?.submitted_at && session.started_by === field.user.id)),
      canEditSpa: !visit.completed_at,
    };
  } else {
    const { dossier } = field;
    const [last, appointmentResult, reportResult, contact, reportDetails, unplanning] = await Promise.all([
      sessionResult,
      supabase.from("partner_appointments").select("diagnostic_id,starts_at,ends_at,technician_id,updated_at")
        .eq("diagnostic_id", id).eq("partner_id", partner.id).maybeSingle(),
      supabase.from("intervention_reports").select("id,performed_at,submitted_at,findings,actions,next_steps,client_validated_at,client_outcome")
        .eq("diagnostic_id", id).eq("partner_id", partner.id).order("submitted_at", { ascending: false }),
      supabase.from("partner_private_clients").select("id").eq("partner_id", partner.id)
        .eq("source_diagnostic_id", id).is("deleted_at", null).maybeSingle(),
      supabase.from("partner_field_sessions").select("report_id,report_details,customer_signer:customer_signature->>name").eq("partner_id", partner.id)
        .eq("diagnostic_id", id).not("report_details", "is", null),
      partner.role === "owner" ? supabase.from("diagnostic_activity").select("metadata").eq("diagnostic_id", id)
        .eq("event_type", "appointment_cancelled").eq("metadata->>partner_id", partner.id).order("created_at") : null,
    ]);
    if (last.error || appointmentResult.error || reportResult.error || contact.error || reportDetails.error || unplanning?.error)
      throw last.error || appointmentResult.error || reportResult.error || contact.error || reportDetails.error || unplanning?.error;
    const appointment = appointmentResult.data ?? undefined;
    if (partner.role !== "owner" && appointment?.technician_id !== field.technicianId)
      throw fieldError({ message: "FIELD_NOT_FOUND" });
    const details = new Map(reportDetails.data.map(item => [item.report_id, item]));
    const reports = reportResult.data.map(report => ({
      ...report, details: details.get(report.id)?.report_details, customerSigner: details.get(report.id)?.customer_signer,
    }));
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
      appointment: appointment ?? null, session: session && { id: session.id, started_at: session.started_at, submitted_at: session.submitted_at },
      photos: session && includePhotos ? await loadFieldPhotos(supabase, partner.id, session.id, true, fieldPhotoEndpoint(field, session.id)) : [],
      workStatus, reports, spaId: link?.data?.spa_id ?? null, spas: equipment?.data ?? [],
      unplannedAppointments: unplanning?.data?.map(entry => entry.metadata as AppointmentUnplanning),
      declaredSpa: [customer?.spa_brand, customer?.spa_model].filter(Boolean).join(" "),
      canStart: !session && Boolean(appointment && Date.parse(appointment.starts_at) <= now) && (workStatus === "scheduled" || workStatus === "due"),
      canValidate: false, canEditSpa: partner.role === "owner" && Boolean(clientId) && (["pending", "scheduled", "due", "in_progress"].includes(workStatus)),
    };
  }
  return result;
}

async function buildFieldVisitPdf(field: FieldCase, result: FieldVisit, report: FieldReport) {
  const spa = result.spas.find(item => item.id === result.spaId);
  return buildFieldReportPdf(field.supabase, {
    source: field.source, visitId: field.id, partnerId: field.partner.id, company: field.partner.company_name,
    customerName: result.customer.name, address: result.customer.address, title: result.title, reference: result.reference,
    spa: spa ? partnerSpaOption(spa) : result.declaredSpa,
  }, report);
}

export async function GET(request: Request, context: Context) {
  try {
    const field = await fieldCase(request, context);
    const params = new URL(request.url).searchParams;
    if (params.get("stock") === "1") {
      const { supabase, partner, source, id } = field;
      const search = z.string().trim().max(100).parse(params.get("search") ?? "");
      const catalog = supabase.from("partner_private_stock").select("id,label,reference,quantity")
        .eq("partner_id", partner.id).eq("category", "piece").gt("quantity", 0);
      const [usage, pieces] = await Promise.all([
        supabase.rpc("get_partner_field_stock_usage", { p_partner: partner.id, p_source: source, p_visit: id }),
        params.get("history") === "1" ? null : (search ? catalog.or(stockSearchFilter(search)) : catalog).order("label").order("id").limit(21),
      ]);
      if (usage.error || pieces?.error) throw usage.error || pieces?.error;
      return NextResponse.json({ usage: usage.data ?? [], pieces: pieces?.data?.slice(0, 20) ?? [],
        more: (pieces?.data?.length ?? 0) > 20 }, { headers });
    }
    if (params.has("photo")) {
      const sessionId = uuid.parse(params.get("session"));
      const photoId = uuid.parse(params.get("photo"));
      const session = await ownSession(field, sessionId);
      const photo = await field.supabase.from("partner_field_photos").select("id")
        .eq("session_id", session.id).eq("id", photoId).maybeSingle();
      if (photo.error) throw photo.error;
      if (!photo.data) throw fieldError({ message: "FIELD_NOT_FOUND" });
      const { data, error } = await field.supabase.storage.from(fieldPhotoBucket)
        .download(fieldPhotoPath(field.partner.id, session.id, photoId));
      if (error || !data) throw new HttpError(404, "Cette photo est indisponible.");
      return new NextResponse(data, { headers: { ...headers, "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" } });
    }
    const reportParam = params.get("rapport");
    const pdfReport = reportParam === null ? null : uuid.parse(reportParam);
    const result = await loadFieldVisit(field, !pdfReport);
    if (pdfReport) {
      const report = result.reports.find(item => item.id === pdfReport);
      if (!report) throw fieldError({ message: "FIELD_REPORT_NOT_FOUND" });
      const bytes = await buildFieldVisitPdf(field, result, report);
      return new NextResponse(bytes, { headers: { ...headers, "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fieldReportFilename(report.id)}"` } });
    }
    const eligible = result.reports.filter(report => reportMayBeEmailed(field.source, result, report));
    if (eligible.length) {
      const recipient = await fieldReportRecipient(field);
      result.reportRecipient = recipient;
      if (recipient) {
        const sent = await field.supabase.from("partner_field_pdf_deliveries").select("report_id,sent_at")
          .in("report_id", eligible.map(report => report.id)).eq("recipient", recipient).not("sent_at", "is", null);
        if (sent.error) throw sent.error;
        const byReport = new Map(sent.data.map(record => [record.report_id, record.sent_at]));
        for (const report of eligible) report.pdfSentAt = byReport.get(report.id) ?? null;
      }
    }
    return NextResponse.json({ ...result, reportTemplate: field.template, userId: field.user.id, canManage: field.partner.role === "owner" }, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const field = await fieldCase(request, context);
    const { partner, supabase, user, source, id } = field;
    const command = fieldCommands.parse(await readJson(request, 65536));
    const actor = { p_partner: partner.id, p_actor: user.id };
    await rateLimit(supabase, `partner-field:${partner.id}`, 30);
    if (command.action === "start") {
      const { error } = await supabase.rpc("start_partner_field_visit", { ...actor, p_source: source, p_id: id });
      if (error) throw fieldError(error);
    } else if (command.action === "stockUsage") {
      const { error } = await supabase.rpc("set_partner_field_stock_usage", {
        ...actor, p_source: source, p_visit: id, p_session: command.session, p_stock: command.stockId,
        p_quantity: command.quantity, p_expected: command.expected, p_operation: command.operation,
      });
      if (error?.code === "23505") throw fieldError({ message: "STOCK_CHANGED" });
      if (error) throw fieldError(error);
    } else if (command.action === "report") {
      await ownSession(field, command.session);
      const details = field.template ? parseFieldDetails(field.template, command.details) : null;
      if (command.signature && !details) throw new HttpError(400, "La signature est réservée aux rapports SAV et de mise en service.");
      const findings = details?.answers.observations || (details ? "Nature de l’intervention : " + details.answers.nature : command.findings);
      const actions = details?.template === "installation"
        ? fieldReportRows(details).filter(row => row.label !== "Observations").map(row => row.label + " : " + row.value).join("\n").slice(0, 5000)
        : details?.answers.works || command.actions;
      if (details?.template === "sav" && details.answers.finished === "Non" && !command.nextSteps)
        throw new HttpError(400, "Indiquez la suite à donner avant de valider.");
      const nextSteps = command.nextSteps || (details ? emptyFieldNextSteps : "");
      const result = reportSchema.parse({
        action: "report", id: command.id, performedAt: command.performedAt, onSite: command.onSite,
        findings: details && findings.length < 20 ? "Observations du technicien : " + findings : findings,
        actions: details && actions.length < 20 ? "Travaux effectués : " + actions : actions, nextSteps,
      });
      const procedure = command.signature ? "submit_signed_partner_field_report" :
        details ? "submit_structured_partner_field_report" : "submit_partner_field_report";
      const { error } = await supabase.rpc(procedure, {
        ...actor, p_session: command.session, p_report: command.id, p_performed: command.performedAt,
        p_findings: result.findings, p_actions: result.actions, p_next: result.nextSteps,
        ...(details ? { p_details: details } : {}),
        ...(command.signature ? { p_signature: command.signature } : {}),
      });
      if (error) throw fieldError(error);
      if (source === "sanispa") {
        try { await processNotifications(`report:${command.id}`); }
        catch { console.error("Notification du compte rendu à relancer."); }
      }
    } else if (command.action === "sendPdf") {
      const result = await loadFieldVisit(field, false);
      const report = result.reports.find(item => item.id === command.reportId);
      if (!report) throw fieldError({ message: "FIELD_REPORT_NOT_FOUND" });
      if (!reportMayBeEmailed(source, result, report)) throw new HttpError(409, "Le compte rendu doit être signé et validé avant l’envoi.");
      const email = await fieldReportRecipient(field);
      if (!email || email !== command.expectedEmail) throw new HttpError(409, "Vérifiez l’adresse e-mail du client puis actualisez la fiche.");
      const pdf = await buildFieldVisitPdf(field, result, report);
      if (partner.role !== "owner") await fieldCase(request, context);
      const delivery = await deliverFieldReport(supabase, { reportId: report.id, email, company: partner.company_name, pdf });
      return NextResponse.json(delivery, { headers });
    } else if (command.action === "followup") {
      const { data: visitId, error } = await supabase.rpc("create_partner_field_followup", {
        ...actor, p_source: source, p_id: id, p_report: command.reportId,
        p_title: field.source === "sanispa" ? problemLabel(field.dossier.problem_type) : field.visit.title,
      });
      if (error) throw fieldError(error);
      return NextResponse.json({ visitId }, { headers });
    } else {
      if (field.source !== "private") throw new HttpError(400, "Cette action est réservée aux interventions privées.");
      if (command.action === "validate") {
        const { error } = await supabase.rpc("advance_partner_private_visit", {
          ...actor, p_visit: id, p_expected: command.version, p_validate: true,
        });
        if (error) throw fieldError(error);
      } else {
        let update = supabase.from("partner_private_visits").update({ spa_id: command.spaId, updated_at: new Date().toISOString() })
          .eq("partner_id", partner.id).eq("id", id).eq("updated_at", command.version).is("completed_at", null);
        if (partner.role !== "owner") update = update.eq("technician_id", field.technicianId!).not("starts_at", "is", null);
        const { data, error } = await update.select("id").maybeSingle();
        if (error?.code === "23503") throw new HttpError(400, "Choisissez un spa de cette fiche client.");
        if (error) throw error;
        if (!data) throw new HttpError(409, "La fiche a évolué. Actualisez-la avant de modifier le spa.");
      }
    }
    return NextResponse.json({ saved: true }, { headers });
  } catch (error) { return apiError(error); }
}

function parseFieldDetails(template: FieldReportDetails["template"], input?: Record<string, string>): FieldReportDetails {
  const answers = Object.fromEntries(fieldForms[template].fields.map(field => {
    const value = input?.[field.key]?.trim() || "";
    if (!value && !field.optional || (value && field.type === "choice" && !(field.options ?? fieldChoices).includes(value)))
      throw new HttpError(400, "Renseignez « " + field.label + " » avant de valider.");
    if (field.type === "text" && value.length > 180) throw new HttpError(400, "« " + field.label + " » dépasse 180 caractères.");
    return [field.key, value];
  }));
  return { template, answers };
}

async function changePhoto(request: Request, context: Context, remove: boolean) {
  const field = await fieldCase(request, context);
  const { partner, supabase, user } = field;
  const params = new URL(request.url).searchParams;
  const session = await ownSession(field, uuid.parse(params.get("session")));
  const photo = uuid.parse(params.get("photo"));
  const kind = z.enum(fieldPhotoKinds).parse(params.get("kind") || "extra");
  if (!remove && kind !== "extra" && !(kind === "receipt" && field.template === "sav") &&
    !(field.template && requiredFieldPhotos[field.template].includes(kind)))
    throw new HttpError(400, "Cette catégorie de photo ne correspond pas au rapport.");
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
  const { error } = await supabase.rpc(remove ? "change_partner_field_photo" : "store_partner_field_photo", {
    p_partner: partner.id, p_actor: user.id, p_session: session.id, p_photo: photo, ...(remove ? { p_remove: true } : { p_kind: kind }),
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
