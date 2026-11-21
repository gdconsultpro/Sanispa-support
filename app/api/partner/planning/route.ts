import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { interventionError } from "@/lib/interventions";
import { partnerClientAddress, partnerVisitAddress, type PendingPartnerDossier, type PendingPrivatePartnerVisit,
  type PrivatePartnerClient, type PrivatePartnerVisit, type SanispaPartnerVisit } from "@/lib/partner-planner";

const privateClientColumns = "id,name,phone,email,street,postal_code,city,intervention_type,description,latitude,longitude,source_diagnostic_id";
const privateVisitColumns = `id,title,description,starts_at,ends_at,technician_id,updated_at,client:partner_private_clients!inner(${privateClientColumns})`;
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
  starts_at: timestamp.nullable(),
  ends_at: timestamp.nullable(),
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
const tourInput = z.object({
  action: z.literal("bookTourVisit"), source: z.enum(["private", "sanispa"]), id: z.string().uuid(),
  expected_at: timestamp.nullable(), starts_at: timestamp, ends_at: timestamp, technician_id: z.string().uuid(),
}).strict();
const actions = z.discriminatedUnion("action", [privateClientInput, privateVisitInput, stockInput, locateClientInput, technicianInput, moveInput, tourInput]);
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

type Address = Pick<PrivatePartnerClient, "street" | "postal_code" | "city">;
type MapLocation = { latitude: number | null; longitude: number | null; approximateLocation?: boolean };

async function locateAddress(address: Address, budget?: AbortSignal, municipality = false) {
  const unknown = { latitude: null, longitude: null };
  if (!address.city || (!municipality && (!address.street || !address.postal_code))) return unknown;
  const params = new URLSearchParams({
    q: partnerClientAddress(municipality ? { ...address, street: "" } : address), index: "address", limit: "5",
  });
  if (address.postal_code) params.set("postcode", address.postal_code);
  if (municipality) params.set("type", "municipality");
  const compact = (s: string) => s.toLowerCase().replace(/\s/g, "");
  const normalizeCity = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const number = address.street.match(/^\d+(?:\s*(?:bis|ter|quater)(?=\s|$)|[a-z](?=\s|$))?/i)?.[0];
  try {
    const response = await fetch("https://data.geopf.fr/geocodage/search?" + params, {
      cache: "no-store", signal: budget ? AbortSignal.any([budget, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
    });
    if (!response.ok) return unknown;
    const results = z.object({
      features: z.array(z.object({
        geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]) }),
        properties: z.object({ postcode: z.string().optional(), score: z.number(), type: z.string(),
          housenumber: z.string().optional(), city: z.string().optional(), citycode: z.string().optional() }),
      })),
    }).safeParse(await response.json());
    if (!results.success) return unknown;
    const matches = results.data.features.filter(({ properties }) =>
      (!address.postal_code || properties.postcode === address.postal_code) && properties.score >= 0.65 &&
      (municipality ? properties.type === "municipality" && normalizeCity(properties.city ?? "") === normalizeCity(address.city)
        : number ? properties.type === "housenumber" && compact(properties.housenumber ?? "") === compact(number)
        : ["street", "locality"].includes(properties.type)));
    if (municipality && new Set(matches.map(match => match.properties.citycode)).size > 1) return unknown;
    const match = matches[0];
    if (!match) return unknown;
    const [longitude, latitude] = match.geometry.coordinates;
    return { latitude, longitude };
  } catch {
    return unknown;
  }
}

async function mapLocations(clients: PrivatePartnerClient[], sanispaAddresses: Array<Address | null>) {
  function addressKey(address: Address) {
    return partnerClientAddress(address).toLowerCase();
  }
  const located = new Map<string, Awaited<ReturnType<typeof locateAddress>>>();
  const lookup = new Map<string, Address>();
  for (const client of clients) {
    if (client.latitude !== null && client.longitude !== null) {
      located.set(addressKey(client), { latitude: client.latitude, longitude: client.longitude });
    }
  }
  for (const address of [...clients, ...sanispaAddresses]) {
    if (!address?.street || !address.postal_code || !address.city) continue;
    const key = addressKey(address);
    if (!located.has(key)) lookup.set(key, address);
  }
  const budget = AbortSignal.timeout(8000);
  const municipalities = new Map<string, Awaited<ReturnType<typeof locateAddress>>>();
  let nextBatch = 0;
  async function locateBatch(addresses: Map<string, Address>, municipality: boolean) {
    const remaining = [...addresses.entries()];
    for (let offset = 0; offset < remaining.length && !budget.aborted; offset += 20) {
      const delay = nextBatch - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      if (budget.aborted) break;
      nextBatch = Date.now() + 600;
      await Promise.all(remaining.slice(offset, offset + 20).map(async ([key, address]) => {
        (municipality ? municipalities : located).set(key, await locateAddress(address, budget, municipality));
      }));
    }
  }
  await locateBatch(lookup, false);
  const municipalityKey = (address: Address) => addressKey({ ...address, street: "" });
  const incompleteMunicipalities = new Map<string, Address>();
  for (const address of [...clients, ...sanispaAddresses]) {
    if (address?.city && located.get(addressKey(address))?.latitude == null) {
      incompleteMunicipalities.set(municipalityKey(address), address);
    }
  }
  await locateBatch(incompleteMunicipalities, true);
  return (address: Address | null): MapLocation | undefined => {
    if (!address) return undefined;
    const precise = located.get(addressKey(address));
    if (precise?.latitude != null) return precise;
    const approximate = municipalities.get(municipalityKey(address));
    return approximate?.latitude == null ? precise : { ...approximate, approximateLocation: true };
  };
}

async function pendingRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const size = 250;
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const { data, error } = await page(offset, offset + size - 1);
    if (error) throw error;
    if (data) rows.push(...data);
    if (!data || data.length < size) return rows;
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
    const forMap = params.get("map") === "1";
    if (forMap && duration > 8 * 24 * 3600000) throw new HttpError(400, "Choisissez un jour ou une semaine pour la carte.");
    const privateQuery = () => supabase.from("partner_private_visits").select(privateVisitColumns)
      .eq("partner_id", partner.id).eq("client.partner_id", partner.id);
    const [privateVisits, sanispaVisits, team, waitingPrivate, waitingSanispa] = await Promise.all([
      privateQuery().lt("starts_at", to).gt("ends_at", from).order("starts_at"),
      supabase.from("partner_appointments")
        .select("diagnostic_id,starts_at,ends_at,technician_id,updated_at,diagnostic:diagnostics!inner(problem_type,status,customer:customers(name,address))")
        .eq("partner_id", partner.id).eq("diagnostic.assigned_partner_id", partner.id).is("diagnostic.archived_at", null)
        .lt("starts_at", to).gt("ends_at", from).order("starts_at"),
      technicians(),
      forMap ? pendingRows((from, to) => privateQuery().is("starts_at", null)
        .order("updated_at", { ascending: false }).order("id").range(from, to)) : null,
      forMap ? pendingRows((from, to) => supabase.from("diagnostics")
        .select("id,problem_type,status,customer:customers(name,address),partner_appointments(),intervention_reports()")
        .eq("assigned_partner_id", partner.id).is("archived_at", null).not("status", "in", "(CLOSED,terminé)")
        .is("partner_appointments", null).is("intervention_reports", null)
        .order("created_at", { ascending: false }).order("id").range(from, to)) : null,
    ]);
    if (privateVisits.error) throw privateVisits.error;
    if (sanispaVisits.error) throw sanispaVisits.error;
    if (forMap) {
      const visits = privateVisits.data as unknown as PrivatePartnerVisit[];
      const sanispa = sanispaVisits.data as unknown as SanispaPartnerVisit[];
      const pendingVisits = (waitingPrivate ?? []) as unknown as PendingPrivatePartnerVisit[];
      const pendingDossiers = (waitingSanispa ?? []) as unknown as PendingPartnerDossier[];
      const dossierAddress = (dossier: PendingPartnerDossier | SanispaPartnerVisit["diagnostic"]) => partnerVisitAddress(dossier.customer?.address);
      const pendingDossierAddresses = pendingDossiers.map(dossierAddress);
      const location = await mapLocations(
        [...visits, ...pendingVisits].map(visit => visit.client),
        [...sanispa.map(visit => dossierAddress(visit.diagnostic)), ...pendingDossierAddresses],
      );
      function locateVisit<T extends (PrivatePartnerVisit | PendingPrivatePartnerVisit)>(visit: T) {
        const point = visit.client.latitude === null || visit.client.longitude === null
          ? location(visit.client) : undefined;
        return { ...visit, latitude: point?.latitude ?? visit.client.latitude, longitude: point?.longitude ?? visit.client.longitude,
          approximateLocation: point?.approximateLocation };
      }
      return NextResponse.json({
        visits: visits.map(locateVisit),
        sanispa: sanispa.map(visit => ({ ...visit, ...location(dossierAddress(visit.diagnostic)) })),
        pendingVisits: pendingVisits.map(locateVisit),
        pendingDossiers: pendingDossiers.map((dossier, index) => ({ ...dossier, ...location(pendingDossierAddresses[index]) })),
        technicians: team,
      });
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
      if (/APPOINTMENT_CHANGED|partner_private_visits_schedule_pair/.test(error?.message ?? ""))
        throw new HttpError(409, "Ce rendez-vous a été modifié. Le planning a été actualisé.");
      if (error) throw interventionError(error);
      return NextResponse.json({ saved: true });
    }
    if (command.action === "bookTourVisit") {
      const { error } = await supabase.rpc("book_partner_tour_visit", {
        p_partner: partner.id, p_actor: user.id, p_source: command.source, p_id: command.id,
        p_expected: command.expected_at, p_start: command.starts_at, p_end: command.ends_at, p_technician: command.technician_id,
      });
      if (error?.message.includes("TECHNICIAN_SLOT_OCCUPIED")) throw new HttpError(409, "Ce technicien a déjà un rendez-vous sur ce créneau. Choisissez un autre horaire.");
      if (error?.message.includes("APPOINTMENT_CHANGED")) throw new HttpError(409, "Cette intervention a déjà été modifiée ou planifiée. Actualisez la carte.");
      if (error?.message.includes("TECHNICIAN_NOT_FOUND")) throw new HttpError(400, "Choisissez un technicien de votre équipe.");
      if (error?.message.includes("INVALID_APPOINTMENT_DURATION")) throw new HttpError(400, "Choisissez une durée comprise entre 1 minute et 12 heures.");
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
    if (input.starts_at !== null || input.ends_at !== null) {
      const duration = input.starts_at !== null && input.ends_at !== null ? Date.parse(input.ends_at) - Date.parse(input.starts_at) : 0;
      if (!(duration > 0 && duration <= 12 * 3600000))
        throw new HttpError(400, "Prévoyez une fin après le début et une durée de 12 heures maximum.");
    }
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
