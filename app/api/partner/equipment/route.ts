import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { validateDocument } from "@/lib/documents";
import { apiError, HttpError, readBytes, readJson } from "@/lib/http";
import { requirePartnerPlanner } from "@/lib/partner-auth";

const bucket = "partner-client-spa-photos";
const privateHeaders = { "Cache-Control": "private, no-store" };
const uuid = z.string().uuid();
const validDue = z.string().date().refine(value => value >= "1900-01-01" && value <= "2099-12-31");
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveSpa"), id: uuid, client_id: uuid,
    brand: z.string().trim().min(1).max(100), model: z.string().trim().max(100), serial_number: z.string().trim().max(100),
    expected_at: z.string().datetime({ offset: true }).nullable() }).strict(),
  z.object({ action: z.literal("linkDossierSpa"), client_id: uuid, diagnostic_id: uuid, spa_id: uuid.nullable() }).strict(),
  z.object({ action: z.literal("saveMaintenance"), client_id: uuid, spa_id: uuid,
    frequency: z.number().int().min(1).max(365), unit: z.enum(["day", "week", "month", "year"]),
    next_due_on: validDue, active: z.boolean(), expected_at: z.string().datetime({ offset: true }).nullable() }).strict(),
]);

async function requireEquipmentClient(request: Request, clientId: string) {
  const { partner, supabase, user } = await requirePartnerPlanner(request);
  const { data, error } = await supabase.from("partner_private_clients").select("source_diagnostic_id")
    .eq("partner_id", partner.id).eq("id", clientId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Cette fiche client est introuvable.");
  return { partner, supabase, user, client: data };
}

async function photoFolder(request: Request) {
  const query = new URL(request.url).searchParams;
  const clientId = uuid.parse(query.get("client"));
  const spaId = uuid.parse(query.get("spa"));
  const { partner, supabase } = await requireEquipmentClient(request, clientId);
  const { data, error } = await supabase.from("partner_client_spas").select("id")
    .eq("partner_id", partner.id).eq("client_id", clientId).eq("id", spaId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Ce spa est introuvable dans cette fiche client.");
  return { partner, supabase, query, clientId, spaId, folder: [partner.id, clientId, spaId].join("/") };
}

async function maintenanceView(supabase: Awaited<ReturnType<typeof requireEquipmentClient>>["supabase"], partnerId: string, clientId: string, spaId: string) {
  const { data: plan, error } = await supabase.from("partner_spa_maintenance").select("id,frequency,unit,next_due_on,active,updated_at")
    .eq("partner_id", partnerId).eq("client_id", clientId).eq("spa_id", spaId).maybeSingle();
  if (error) throw error;
  if (!plan) return { plan: null, upcoming: null };
  const upcoming = await supabase.from("partner_private_visits").select("id,starts_at,maintenance_due_on")
    .eq("partner_id", partnerId).eq("maintenance_plan_id", plan.id).is("completed_at", null).maybeSingle();
  if (upcoming.error) throw upcoming.error;
  return { plan, upcoming: upcoming.data };
}

export async function GET(request: Request) {
  try {
    const { supabase, partner, query, folder, clientId, spaId } = await photoFolder(request);
    if (query.get("section") === "maintenance")
      return NextResponse.json(await maintenanceView(supabase, partner.id, clientId, spaId), { headers: privateHeaders });
    const offset = z.coerce.number().int().min(0).max(1000000).parse(query.get("offset") ?? 0);
    const storage = supabase.storage.from(bucket);
    const { data, error } = await storage.list(folder, { limit: 13, offset, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw error;
    const paths = data.slice(0, 12).map(photo => folder + "/" + photo.name);
    if (!paths.length) return NextResponse.json({ photos: [], more: false }, { headers: privateHeaders });
    const signed = await storage.createSignedUrls(paths, 300);
    if (signed.error) throw signed.error;
    const photos = signed.data.flatMap(photo => {
      const id = uuid.safeParse(photo.path?.split("/").at(-1)?.replace(/\.jpg$/, ""));
      return id.success && photo.signedUrl ? [{ id: id.data, url: photo.signedUrl }] : [];
    });
    return NextResponse.json({ photos, more: data.length > 12 }, { headers: privateHeaders });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { partner, supabase, query, folder } = await photoFolder(request);
    const id = uuid.parse(query.get("photo"));
    await rateLimit(supabase, `partner-spa-photos:${partner.id}`, 45);
    if (request.headers.get("content-type") !== "image/jpeg") throw new HttpError(415, "Choisissez une photo au format JPG.");
    const bytes = await readBytes(request, 512 * 1024);
    validateDocument("photo.jpg", "image/jpeg", bytes);
    const { error } = await supabase.storage.from(bucket).upload(folder + "/" + id + ".jpg", bytes, {
      contentType: "image/jpeg", cacheControl: "0", upsert: true,
    });
    if (error) throw error;
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { partner, supabase, query, folder } = await photoFolder(request);
    const id = uuid.parse(query.get("photo"));
    await rateLimit(supabase, `partner-spa-photos:${partner.id}`, 45);
    const { error } = await supabase.storage.from(bucket).remove([folder + "/" + id + ".jpg"]);
    if (error) throw error;
    return NextResponse.json({ deleted: true }, { headers: privateHeaders });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const command = commandSchema.parse(await readJson(request, 5000));
    const { partner, supabase, client, user } = await requireEquipmentClient(request, command.client_id);
    await rateLimit(supabase, `partner-client-equipment:${partner.id}`, 30);
    if (command.action === "saveMaintenance") {
      const { error } = await supabase.rpc("save_partner_spa_maintenance", {
        p_partner: partner.id, p_actor: user.id, p_client: command.client_id, p_spa: command.spa_id,
        p_frequency: command.frequency, p_unit: command.unit, p_due: command.next_due_on, p_active: command.active, p_expected: command.expected_at,
      });
      if (error?.message === "MAINTENANCE_CHANGED") throw new HttpError(409, "Le plan a changé. Vérifiez la prochaine échéance avant de réessayer.");
      if (error?.message === "MAINTENANCE_ADDRESS_REQUIRED") throw new HttpError(400, "Complétez d’abord la rue, le code postal et la ville dans la fiche client.");
      if (error?.message === "MAINTENANCE_SPA_NOT_FOUND") throw new HttpError(404, "Ce spa est introuvable dans cette fiche client.");
      if (error) throw error;
      return NextResponse.json(await maintenanceView(supabase, partner.id, command.client_id, command.spa_id), { headers: privateHeaders });
    }
    if (command.action === "saveSpa") {
      const { action: _action, expected_at, ...spa } = command;
      const table = supabase.from("partner_client_spas");
      if (expected_at) {
        const { data, error } = await table.update({ brand: spa.brand, model: spa.model, serial_number: spa.serial_number, updated_at: new Date().toISOString() })
          .eq("partner_id", partner.id).eq("client_id", spa.client_id).eq("id", spa.id).eq("updated_at", expected_at).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new HttpError(409, "Ce spa a été modifié. Rouvrez la fiche pour afficher la version actuelle.");
      } else {
        const { error } = await table.upsert({ ...spa, partner_id: partner.id }, { onConflict: "partner_id,client_id,id", ignoreDuplicates: true });
        if (error) throw error;
      }
    } else {
      if (client.source_diagnostic_id !== command.diagnostic_id) throw new HttpError(404, "Ce dossier est introuvable dans cette fiche client.");
      const { data, error } = await supabase.from("diagnostics").select("id").eq("id", command.diagnostic_id)
        .eq("assigned_partner_id", partner.id).is("archived_at", null).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Ce dossier est introuvable dans cette fiche client.");
      const table = supabase.from("partner_client_spa_dossiers");
      const key = { partner_id: partner.id, client_id: command.client_id, diagnostic_id: command.diagnostic_id };
      const result = command.spa_id
        ? await table.upsert({ ...key, spa_id: command.spa_id }, { onConflict: "partner_id,client_id,diagnostic_id" })
        : await table.delete().match(key);
      if (result.error?.code === "23503") throw new HttpError(400, "Choisissez un spa de cette fiche client.");
      if (result.error) throw result.error;
    }
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) { return apiError(error); }
}
