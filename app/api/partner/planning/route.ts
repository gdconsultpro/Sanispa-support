import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { interventionError } from "@/lib/interventions";
import { partnerClientAddress, partnerVisitAddress, type PrivatePartnerClient, type PrivatePartnerVisit, type SanispaPartnerVisit } from "@/lib/partner-planner";

const privateClientColumns = "id,name,phone,email,street,postal_code,city,intervention_type,description,latitude,longitude,source_diagnostic_id";
const stockColumns = "id,category,label,reference,quantity,updated_at";
const timestamp = z.string().datetime({ offset: true });
const technicianId = z.string().uuid().nullable();
const privateClientInput = z.object({
  action: z.literal("saveClient"),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(140),
  phone: z.string().trim().max(35),
  email: z.string().trim().max(254).refine(email => !email || z.string().email().safeParse(email).success),
  street: z.string().trim().max(160),
  postal_code: z.string().trim().regex(/^(?:\d{5})?$/),
  city: z.string().trim().max(100),
  intervention_type: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2500),
}).strict();
const privateVisitInput = z.object({
  action: z.literal("saveVisit"),
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2500),
  starts_at: timestamp,
  ends_at: timestamp,
  technician_id: technicianId.optional(),
  expected_at: timestamp.optional(),
}).strict();
const stockInput = z.object({
  action: z.literal("saveStock"),
  id: z.string().uuid(),
  category: z.enum(["piece", "spa"]),
  label: z.string().trim().min(1).max(140),
  reference: z.string().trim().max(100),
  quantity: z.number().int().min(0).max(1000000),
  expected_at: z.string().datetime({ offset: true }).nullable(),
}).strict();
const locateClientInput = z.object({ action: z.literal("locateClient"), id: z.string().uuid() }).strict();
const technicianInput = z.object({
  action: z.literal("addTechnician"),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
}).strict();
const moveInput = z.object({
  action: z.literal("moveVisit"),
  source: z.enum(["private", "sanispa"]),
  id: z.string().uuid(),
  expected_at: timestamp,
  starts_at: timestamp,
  technician_id: technicianId,
}).strict();
const actions = z.discriminatedUnion("action", [privateClientInput, privateVisitInput, stockInput, locateClientInput, technicianInput, moveInput]);
const rangeInput = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

async function requirePlanner(request: Request) {
  const context = await getAuthenticatedPartner(request);
  if (!context.partner || !context.user) throw new HttpError(401, "Connexion partenaire requise.");
  if (context.partner.verification_status === "pending")
    throw new HttpError(403, "Votre planning sera disponible après la validation de votre entreprise.");
  return { ...context, partner: context.partner, user: context.user };
}

async function locateAddress(address: Pick<PrivatePartnerClient, "street" | "postal_code" | "city">) {
  const unknown = { latitude: null, longitude: null };
  if (!address.street || !address.postal_code || !address.city) return unknown;
  const params = new URLSearchParams({
    q: partnerClientAddress(address), index: "address", limit: "5", postcode: address.postal_code,
  });
  const compact = (s: string) => s.toLowerCase().replace(/\s/g, "");
  const number = address.street.match(/^\d+(?:\s*(?:bis|ter|quater)(?=\s|$)|[a-z](?=\s|$))?/i)?.[0];
  try {
    const response = await fetch("https://data.geopf.fr/geocodage/search?" + params, {
      cache: "no-store", signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return unknown;
    const results = z.object({
      features: z.array(z.object({
        geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]) }),
        properties: z.object({ postcode: z.string().optional(), score: z.number(), type: z.string(), housenumber: z.string().optional() }),
      })),
    }).safeParse(await response.json());
    if (!results.success) return unknown;
    const match = results.data.features.find(({ properties }) =>
      properties.postcode === address.postal_code && properties.score >= 0.65 &&
      (number ? properties.type === "housenumber" && compact(properties.housenumber ?? "") === compact(number) : ["street", "locality"].includes(properties.type)),
    );
    if (!match) return unknown;
    const [longitude, latitude] = match.geometry.coordinates;
    return { latitude, longitude };
  } catch {
    return unknown;
  }
}

export async function GET(request: Request) {
  try {
    const { partner, supabase } = await requirePlanner(request);
    const params = new URL(request.url).searchParams;
    async function technicians() {
      const { data, error } = await supabase.from("partner_planning_technicians").select("id,name")
        .eq("partner_id", partner.id).order("name").order("id");
      if (error) throw error;
      return data;
    }
    if (!params.has("from") && !params.has("to")) {
      const offset = z.coerce.number().int().min(0).max(1000000).parse(params.get("offset") ?? 0);
      if (params.get("section") === "stock") {
        const { data, error } = await supabase.from("partner_private_stock").select(stockColumns).eq("partner_id", partner.id)
          .order("label").order("id").range(offset, offset + 30);
        if (error) throw error;
        return NextResponse.json({ stock: data.slice(0, 30), more: data.length > 30 });
      }
      const name = z.string().trim().max(140).parse(params.get("name") ?? "");
      let query = supabase.from("partner_private_clients").select(privateClientColumns).eq("partner_id", partner.id);
      if (name) query = query.ilike("name", `%${name.replace(/[\\%_]/g, "\\$&")}%`);
      const [{ data, error }, team] = await Promise.all([query.order("name").order("id").range(offset, offset + 30), technicians()]);
      if (error) throw error;
      return NextResponse.json({ clients: data.slice(0, 30), more: data.length > 30, technicians: team });
    }

    const { from, to } = rangeInput.parse({ from: params.get("from"), to: params.get("to") });
    const duration = Date.parse(to) - Date.parse(from);
    if (!(duration > 0 && duration <= 32 * 24 * 3600000)) throw new HttpError(400, "Choisissez une période valide.");
    const [privateVisits, sanispaVisits, team] = await Promise.all([
      supabase.from("partner_private_visits")
        .select(`id,title,description,starts_at,ends_at,technician_id,updated_at,client:partner_private_clients!inner(${privateClientColumns})`)
        .eq("partner_id", partner.id).eq("client.partner_id", partner.id).lt("starts_at", to).gt("ends_at", from).order("starts_at"),
      supabase.from("partner_appointments")
        .select("diagnostic_id,starts_at,ends_at,technician_id,updated_at,diagnostic:diagnostics!inner(problem_type,status,customer:customers(name,address))")
        .eq("partner_id", partner.id).eq("diagnostic.assigned_partner_id", partner.id).is("diagnostic.archived_at", null)
        .lt("starts_at", to).gt("ends_at", from).order("starts_at"),
      params.get("map") === "1" ? [] : technicians(),
    ]);
    if (privateVisits.error) throw privateVisits.error;
    if (sanispaVisits.error) throw sanispaVisits.error;
    if (params.get("map") === "1" && duration <= 26 * 3600000) {
      const addresses = new Map<string, ReturnType<typeof locateAddress>>();
      function locate(address: Pick<PrivatePartnerClient, "street" | "postal_code" | "city"> | null) {
        if (!address?.street || !address.postal_code || !address.city) return;
        const key = partnerClientAddress(address).toLowerCase();
        if (!addresses.has(key) && addresses.size < 25) addresses.set(key, locateAddress(address));
        return addresses.get(key);
      }
      const [visits, sanispa] = await Promise.all([
        Promise.all((privateVisits.data as unknown as PrivatePartnerVisit[]).map(async visit => {
          if (visit.client.latitude !== null && visit.client.longitude !== null) return visit;
          return { ...visit, client: { ...visit.client, ...await locate(visit.client) } };
        })),
        Promise.all((sanispaVisits.data as unknown as SanispaPartnerVisit[]).map(async visit => ({
          ...visit, ...await locate(partnerVisitAddress(visit.diagnostic.customer?.address)),
        }))),
      ]);
      return NextResponse.json({ visits, sanispa, technicians: team });
    }
    return NextResponse.json({ visits: privateVisits.data, sanispa: sanispaVisits.data, technicians: team });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { partner, supabase, user } = await requirePlanner(request);
    const command = actions.parse(await readJson(request, 14000));
    await rateLimit(supabase, `partner-private-planner:${partner.id}`, 30);
    const updated_at = new Date().toISOString();
    if (command.action === "addTechnician") {
      const { error } = await supabase.from("partner_planning_technicians")
        .upsert({ id: command.id, name: command.name, partner_id: partner.id }, { onConflict: "partner_id,id", ignoreDuplicates: true });
      if (error) throw error;
      return NextResponse.json({ saved: true });
    }
    if (command.action === "moveVisit") {
      const { error } = await supabase.rpc("move_partner_planned_appointment", {
        p_partner: partner.id, p_actor: user.id, p_source: command.source, p_id: command.id,
        p_expected: command.expected_at, p_start: command.starts_at, p_technician: command.technician_id,
      });
      if (error?.message.includes("TECHNICIAN_NOT_FOUND")) throw new HttpError(404, "Ce technicien est introuvable dans votre planning.");
      if (error?.message.includes("APPOINTMENT_CHANGED")) throw new HttpError(409, "Ce rendez-vous a été modifié. Le planning a été actualisé.");
      if (error) throw interventionError(error);
      return NextResponse.json({ saved: true });
    }
    if (command.action === "saveStock") {
      const { action: _action, expected_at, ...input } = command;
      const table = supabase.from("partner_private_stock");
      if (expected_at) {
        const { data, error } = await table.update({ ...input, updated_at }).eq("partner_id", partner.id)
          .eq("id", input.id).eq("updated_at", expected_at).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new HttpError(409, "Ce stock a été modifié entre-temps. Rouvrez la fiche pour voir la quantité actuelle.");
      } else {
        const { error } = await table.upsert({ ...input, partner_id: partner.id, updated_at }, { onConflict: "partner_id,id", ignoreDuplicates: true });
        if (error) throw error;
      }
      return NextResponse.json({ saved: true });
    }
    if (command.action === "locateClient") {
      const { data, error } = await supabase.from("partner_private_clients").select(privateClientColumns)
        .eq("partner_id", partner.id).eq("id", command.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Client introuvable dans votre carnet.");
      if (data.latitude !== null && data.longitude !== null) return NextResponse.json({ client: data });
      const position = await locateAddress(data);
      if (position.latitude === null) return NextResponse.json({ client: data });
      const saved = await supabase.from("partner_private_clients").update(position)
        .eq("partner_id", partner.id).eq("id", data.id).eq("street", data.street)
        .eq("postal_code", data.postal_code).eq("city", data.city).select(privateClientColumns).maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) throw new HttpError(409, "L’adresse a été modifiée. Actualisez le planning avant de rouvrir la carte.");
      return NextResponse.json({ client: saved.data });
    }
    if (command.action === "saveClient") {
      const { action: _action, ...input } = command;
      const existing = await supabase.from("partner_private_clients").select("street,postal_code,city,latitude,longitude")
        .eq("partner_id", partner.id).eq("id", input.id).maybeSingle();
      if (existing.error) throw existing.error;
      const previous = existing.data;
      const location = previous && previous.street === input.street && previous.postal_code === input.postal_code
        && previous.city === input.city && previous.latitude !== null && previous.longitude !== null
        ? { latitude: previous.latitude, longitude: previous.longitude }
        : await locateAddress(input);
      const { data, error } = await supabase.from("partner_private_clients")
        .upsert({ ...input, ...location, partner_id: partner.id, updated_at }, { onConflict: "partner_id,id" })
        .select(privateClientColumns).single();
      if (error) throw error;
      return NextResponse.json({ client: data });
    }

    const { action: _action, expected_at, ...input } = command;
    const duration = Date.parse(input.ends_at) - Date.parse(input.starts_at);
    if (duration <= 0 || duration > 12 * 3600000)
      throw new HttpError(400, "Prévoyez une fin après le début et une durée de 12 heures maximum.");
    const table = supabase.from("partner_private_visits");
    const result = expected_at
      ? await table.update({ ...input, updated_at }).eq("partner_id", partner.id).eq("id", input.id)
        .eq("updated_at", expected_at).select("id").maybeSingle()
      : await table.upsert({ ...input, partner_id: partner.id, updated_at }, { onConflict: "partner_id,id" });
    const { error } = result;
    if (error?.code === "23503" && error.message.includes("technician")) throw new HttpError(404, "Ce technicien est introuvable dans votre planning.");
    if (error?.code === "23503") throw new HttpError(404, "Client introuvable dans votre carnet.");
    if (error) throw error;
    if (expected_at && !result.data) throw new HttpError(409, "Ce rendez-vous a été modifié. Revenez au planning avant de réessayer.");
    return NextResponse.json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
