import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { requirePartnerPlanner } from "@/lib/partner-auth";
import { interventionError } from "@/lib/interventions";
import { processNotifications } from "@/lib/notifications";
import { getPartnerRoadRoute } from "@/lib/partner-road-route";
import { maximumTourRouteStops } from "@/lib/partner-tour-routing";
import { partnerClientAddress, partnerClientDossierTiming, partnerVisitAddress,
  type PartnerClientDossier,
  type PendingPartnerDossier, type PendingPrivatePartnerVisit, type PrivatePartnerClient, type PrivatePartnerVisit, type SanispaPartnerVisit } from "@/lib/partner-planner";

const privateClientColumns = "id,name,phone,email,street,postal_code,city,latitude,longitude,source_diagnostic_id";
const visitFields = "id,title,description,starts_at,ends_at,technician_id,updated_at,spa_id,completed_at,validated_at,field_started_at";
const dossierFields = "problem_type,status,public_reference,preview_description,intervened_at,created_at,customer:customers(name,address)";
const reportStateFields = "intervention_reports(performed_at,submitted_at,client_validated_at,client_outcome),partner_field_sessions(appointment_start,submitted_at)";
const spaFields = "id,brand,model,serial_number,updated_at";
const privateVisitColumns = `${visitFields},client:partner_private_clients!inner(${privateClientColumns})`;
const stockColumns = "id,category,label,reference,quantity,updated_at";
const timestamp = z.string().datetime({ offset: true });
const technicianId = z.string().uuid().nullable();
const privateAddressInput = z.object({
  street: z.string().trim().min(1).max(160),
  postal_code: z.string().trim().regex(/^[0-9]{5}$/),
  city: z.string().trim().min(1).max(100),
}).strict();
const privateClientInput = z.object({
  action: z.literal("saveClient"),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(140),
  phone: z.string().trim().max(35),
  email: z.string().trim().max(254).refine(email => !email || z.string().email().safeParse(email).success),
  intervention_type: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(2500).optional(),
}).merge(privateAddressInput);
const privateVisitInput = z.object({
  action: z.literal("saveVisit"),
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2500),
  starts_at: timestamp.nullable(),
  ends_at: timestamp.nullable(),
  technician_id: technicianId.optional(),
  spa_id: z.string().uuid().nullable().optional(),
  expected_at: timestamp.optional(),
  address: privateAddressInput.optional(),
}).strict();
const visitWithContactInput = z.object({
  action: z.literal("createVisitWithClient"),
  client: privateClientInput.omit({ action: true, intervention_type: true, description: true }),
  visit: privateVisitInput.omit({ action: true, client_id: true, expected_at: true, spa_id: true, address: true }),
}).strict();
const deleteVisitInput = z.object({
  action: z.literal("deleteVisit"), id: z.string().uuid(), expected_at: timestamp,
}).strict();
const unplanVisitInput = deleteVisitInput.extend({ action: z.literal("unplanVisit") });
const completeVisitInput = deleteVisitInput.extend({ action: z.literal("completeVisit") });
const validateVisitInput = deleteVisitInput.extend({ action: z.literal("validateVisit") });
const deleteClientInput = z.object({ action: z.literal("deleteClient"), id: z.string().uuid() }).strict();
const restoreClientInput = deleteClientInput.extend({ action: z.literal("restoreClient") });
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
const schedulePendingInput = tourInput.extend({ action: z.literal("schedulePendingVisit"), technician_id: technicianId });
const coordinateInput = z.object({
  latitude: z.number().finite().min(-85).max(85), longitude: z.number().finite().min(-180).max(180),
}).strict();
const tourRouteInput = z.object({
  action: z.literal("routeTour"), stops: z.array(coordinateInput.nullable()).min(2).max(maximumTourRouteStops),
}).strict();
const applyTourInput = z.object({
  action: z.literal("applyTour"),
  day: z.string().date().min(10).max(10),
  technician_id: z.string().uuid(),
  notify_clients: z.boolean().optional(),
  stops: z.array(z.object({
    source: z.enum(["private", "sanispa"]), id: z.string().uuid(), expected_at: timestamp, starts_at: timestamp,
  }).strict()).min(1).max(maximumTourRouteStops),
}).strict();
const actions = z.discriminatedUnion("action", [privateClientInput, privateVisitInput, visitWithContactInput, deleteVisitInput, unplanVisitInput, completeVisitInput, validateVisitInput, deleteClientInput,
  restoreClientInput, stockInput, locateClientInput, technicianInput, moveInput, tourInput, schedulePendingInput, tourRouteInput, applyTourInput]);
const rangeInput = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export const maxDuration = 60;

function validatePrivateVisitTimes({ starts_at, ends_at }: { starts_at: string | null; ends_at: string | null }) {
  if (starts_at === null && ends_at === null) return;
  const duration = starts_at !== null && ends_at !== null ? Date.parse(ends_at) - Date.parse(starts_at) : 0;
  if (!(duration > 0 && duration <= 12 * 3600000))
    throw new HttpError(400, "Prévoyez une fin après le début et une durée de 12 heures maximum.");
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

async function mapLocations(clients: Array<Address & Pick<PrivatePartnerClient, "latitude" | "longitude">>, sanispaAddresses: Array<Address | null>, waitingAddresses: Array<Address | null>) {
  function addressKey(address: Address) {
    return partnerClientAddress(address).toLowerCase();
  }
  const located = new Map<string, Awaited<ReturnType<typeof locateAddress>>>();
  for (const client of clients) {
    if (client.latitude !== null && client.longitude !== null) {
      located.set(addressKey(client), { latitude: client.latitude, longitude: client.longitude });
    }
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
  const municipalityKey = (address: Address) => addressKey({ ...address, street: "" });
  async function locateGroup(addresses: Array<Address | null>) {
    const lookup = new Map<string, Address>();
    for (const address of addresses) {
      if (address?.street && address.postal_code && address.city && !located.has(addressKey(address))) {
        lookup.set(addressKey(address), address);
      }
    }
    await locateBatch(lookup, false);
    const incompleteMunicipalities = new Map<string, Address>();
    for (const address of addresses) {
      if (address?.city && located.get(addressKey(address))?.latitude == null && !municipalities.has(municipalityKey(address))) {
        incompleteMunicipalities.set(municipalityKey(address), address);
      }
    }
    await locateBatch(incompleteMunicipalities, true);
  }
  await locateGroup(waitingAddresses);
  await locateGroup([...clients, ...sanispaAddresses]);
  return (address: Address | null): MapLocation | undefined => {
    if (!address) return undefined;
    const precise = located.get(addressKey(address));
    if (precise?.latitude != null) return precise;
    const approximate = municipalities.get(municipalityKey(address));
    return approximate?.latitude == null ? precise : { ...approximate, approximateLocation: true };
  };
}

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
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
    const { partner, supabase } = await requirePartnerPlanner(request);
    const params = new URL(request.url).searchParams;
    const forMap = params.get("map") === "1";
    const withPending = forMap || params.get("queue") === "1";
    const upcoming = forMap && params.get("scope") === "upcoming";
    async function technicians() {
      const { data, error } = await supabase.from("partner_planning_technicians").select("id,name")
        .eq("partner_id", partner.id).order("name").order("id");
      if (error) throw error;
      return data;
    }
    if (!upcoming && !params.has("from") && !params.has("to")) {
      if (params.get("section") === "next-appointment") {
        const technician = z.union([z.literal("all"), z.literal(""), z.string().uuid()]).parse(params.get("technician") ?? "all");
        const now = new Date().toISOString();
        let privateAppointments = supabase.from("partner_private_visits").select("starts_at")
          .eq("partner_id", partner.id).gte("starts_at", now);
        let sanispaAppointments = supabase.from("partner_appointments")
          .select("starts_at,diagnostic:diagnostics!inner(assigned_partner_id)")
          .eq("partner_id", partner.id).eq("diagnostic.assigned_partner_id", partner.id)
          .is("diagnostic.archived_at", null).not("diagnostic.status", "in", "(CLOSED,terminé)").gte("starts_at", now);
        if (!technician) {
          privateAppointments = privateAppointments.is("technician_id", null);
          sanispaAppointments = sanispaAppointments.is("technician_id", null);
        } else if (technician !== "all") {
          privateAppointments = privateAppointments.eq("technician_id", technician);
          sanispaAppointments = sanispaAppointments.eq("technician_id", technician);
        }
        const [own, assigned] = await Promise.all([
          privateAppointments.order("starts_at").limit(1).maybeSingle(),
          sanispaAppointments.order("starts_at").limit(1).maybeSingle(),
        ]);
        if (own.error || assigned.error) throw own.error || assigned.error;
        const next = [own.data?.starts_at, assigned.data?.starts_at].filter((date): date is string => Boolean(date))
          .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
        return NextResponse.json({ startsAt: next ?? null }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const offset = z.coerce.number().int().min(0).max(1000000).parse(params.get("offset") ?? 0);
      const section = params.get("section");
      if (section === "map-clients") throw new HttpError(404, "La carte affiche les interventions.");
      if (section === "client" || section === "client-spas") {
        const id = z.string().uuid().parse(params.get("id"));
        let owner = supabase.from("partner_private_clients").select(privateClientColumns).eq("partner_id", partner.id).eq("id", id);
        if (section === "client") owner = owner.is("deleted_at", null);
        const { data: client, error: clientError } = await owner.maybeSingle();
        if (clientError) throw clientError;
        if (!client) throw new HttpError(404, "Cette fiche client est introuvable.");
        const spas = allRows((from, to) => supabase.from("partner_client_spas").select(spaFields)
          .eq("partner_id", partner.id).eq("client_id", id).order("brand").order("model").order("id").range(from, to));
        if (section === "client-spas") return NextResponse.json({ spas: await spas },
          { headers: { "Cache-Control": "private, no-store" } });
        const now = new Date();
        const [visits, team, dossier, equipment] = await Promise.all([
          supabase.from("partner_private_visits").select("id,title,starts_at,spa_id")
            .eq("partner_id", partner.id).eq("client_id", id).or(`ends_at.lte.${now.toISOString()},completed_at.not.is.null`)
            .order("starts_at", { ascending: false })
            .order("updated_at", { ascending: false }).order("id").range(offset, offset + 30),
          technicians(),
          client.source_diagnostic_id ? supabase.from("diagnostics")
            .select("id,problem_type,status,intervened_at,partner_appointments(starts_at,ends_at,technician_id)")
            .eq("id", client.source_diagnostic_id).eq("assigned_partner_id", partner.id).is("archived_at", null)
            .eq("partner_appointments.partner_id", partner.id).maybeSingle()
            : null,
          spas,
        ]);
        if (visits.error || dossier?.error) throw visits.error || dossier?.error;
        const linkedDossier = dossier?.data as unknown as PartnerClientDossier | null;
        return NextResponse.json({ client, visits: visits.data.slice(0, 30), more: visits.data.length > 30,
          dossier: linkedDossier && partnerClientDossierTiming(linkedDossier, +now) === "past" ? linkedDossier : null, technicians: team, spas: equipment },
          { headers: { "Cache-Control": "private, no-store" } });
      }
      if (section === "visit") {
        const id = z.string().uuid().parse(params.get("id"));
        const [detail, team] = await Promise.all([
          supabase.from("partner_private_visits").select(`${visitFields},client:partner_private_clients!inner(${privateClientColumns},deleted_at)`)
            .eq("partner_id", partner.id).eq("client.partner_id", partner.id).eq("id", id).maybeSingle(),
          technicians(),
        ]);
        if (detail.error) throw detail.error;
        if (!detail.data) throw new HttpError(404, "Cette intervention est introuvable.");
        const visit = detail.data as unknown as PrivatePartnerVisit | PendingPrivatePartnerVisit;
        const spa = visit.spa_id ? await supabase.from("partner_client_spas").select(spaFields)
          .eq("partner_id", partner.id).eq("client_id", visit.client.id).eq("id", visit.spa_id).maybeSingle() : null;
        if (spa?.error) throw spa.error;
        return NextResponse.json({ visit, technicians: team, spa: spa?.data ?? null, canValidate: partner.role === "owner" }, { headers: { "Cache-Control": "private, no-store" } });
      }
      if (params.get("section") === "stock") {
        const { data, error } = await supabase.from("partner_private_stock").select(stockColumns).eq("partner_id", partner.id)
          .order("label").order("id").range(offset, offset + 30);
        if (error) throw error;
        return NextResponse.json({ stock: data.slice(0, 30), more: data.length > 30 });
      }
      const name = z.string().trim().max(140).parse(params.get("name") ?? "");
      const namePattern = `%${name.replace(/[\\%_]/g, "\\$&")}%`;
      if (params.get("section") === "visits") {
        let visits = supabase.from("partner_private_visits")
          .select("id,title,starts_at,ends_at,technician_id,updated_at,client:partner_private_clients!inner(name,street,postal_code,city)")
          .eq("partner_id", partner.id).eq("client.partner_id", partner.id)
          .or("starts_at.is.null,ends_at.gt." + new Date().toISOString());
        if (name) visits = visits.ilike("client.name", namePattern);
        const [{ data, error }, team] = await Promise.all([visits.order("updated_at", { ascending: false })
          .order("id").range(offset, offset + 30), technicians()]);
        if (error) throw error;
        return NextResponse.json({ visits: data.slice(0, 30), more: data.length > 30, technicians: team },
          { headers: { "Cache-Control": "private, no-store" } });
      }
      let query = supabase.from("partner_private_clients").select(privateClientColumns).eq("partner_id", partner.id);
      query = section === "deleted-clients" ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : query.is("deleted_at", null);
      if (name) query = query.ilike("name", namePattern);
      const [{ data, error }, team] = await Promise.all([query.order("name").order("id").range(offset, offset + 30), technicians()]);
      if (error) throw error;
      return NextResponse.json({ clients: data.slice(0, 30), more: data.length > 30, technicians: team });
    }

    const range = upcoming ? null : rangeInput.parse({ from: params.get("from"), to: params.get("to") });
    if (range) {
      const duration = Date.parse(range.to) - Date.parse(range.from);
      if (!(duration > 0 && duration <= 32 * 24 * 3600000)) throw new HttpError(400, "Choisissez une période valide.");
    }
    const now = new Date().toISOString();
    const privateQuery = () => supabase.from("partner_private_visits").select(privateVisitColumns)
      .eq("partner_id", partner.id).eq("client.partner_id", partner.id);
    const sanispaQuery = () => supabase.from("partner_appointments")
      .select(`diagnostic_id,starts_at,ends_at,technician_id,updated_at,diagnostic:diagnostics!inner(${dossierFields},${reportStateFields})`)
      .eq("partner_id", partner.id).eq("diagnostic.assigned_partner_id", partner.id).is("diagnostic.archived_at", null)
      .eq("diagnostic.partner_field_sessions.partner_id", partner.id).eq("diagnostic.intervention_reports.partner_id", partner.id);
    const [privateVisits, sanispaVisits, team, waitingPrivate, waitingSanispa, historicalSanispa] = await Promise.all([
      allRows((from, to) => (range ? privateQuery().lt("starts_at", range.to).gt("ends_at", range.from) : privateQuery().gte("starts_at", now))
        .order("starts_at").order("id").range(from, to)),
      allRows((from, to) => (range ? sanispaQuery().lt("starts_at", range.to).gt("ends_at", range.from)
        : sanispaQuery().gte("starts_at", now).not("diagnostic.status", "in", "(CLOSED,terminé)"))
        .order("starts_at").order("diagnostic_id").range(from, to)),
      technicians(),
      withPending ? allRows((from, to) => privateQuery().is("starts_at", null)
        .order("updated_at", { ascending: false }).order("id").range(from, to)) : null,
      withPending ? allRows((from, to) => supabase.from("diagnostics")
        .select(`id,${dossierFields},partner_appointments(),intervention_reports()`)
        .eq("assigned_partner_id", partner.id).is("archived_at", null).not("status", "in", "(CLOSED,terminé)")
        .is("intervened_at", null)
        .eq("partner_appointments.partner_id", partner.id).is("partner_appointments", null).is("intervention_reports", null)
        .order("created_at", { ascending: false }).order("id").range(from, to)) : null,
      range && withPending && !forMap ? allRows((from, to) => supabase.from("diagnostics")
        .select(`id,${dossierFields},${reportStateFields},partner_appointments()`)
        .eq("assigned_partner_id", partner.id).is("archived_at", null)
        .eq("partner_field_sessions.partner_id", partner.id).eq("intervention_reports.partner_id", partner.id)
        .eq("partner_appointments.partner_id", partner.id).is("partner_appointments", null)
        .or(`and(intervened_at.gte.${range.from},intervened_at.lt.${range.to}),and(intervened_at.is.null,status.in.(CLOSED,terminé),created_at.gte.${range.from},created_at.lt.${range.to})`)
        .order("created_at", { ascending: false }).order("id").range(from, to)) : null,
    ]);
    if (forMap) {
      const visits = privateVisits as unknown as PrivatePartnerVisit[];
      const sanispa = sanispaVisits as unknown as SanispaPartnerVisit[];
      const pendingVisits = (waitingPrivate ?? []) as unknown as PendingPrivatePartnerVisit[];
      const pendingDossiers = (waitingSanispa ?? []) as unknown as PendingPartnerDossier[];
      const dossierAddress = (dossier: PendingPartnerDossier | SanispaPartnerVisit["diagnostic"]) => partnerVisitAddress(dossier.customer?.address);
      const pendingDossierAddresses = pendingDossiers.map(dossierAddress);
      const location = await mapLocations(
        [...visits, ...pendingVisits].map(visit => visit.client),
        [...sanispa.map(visit => dossierAddress(visit.diagnostic)), ...pendingDossierAddresses],
        [...pendingVisits.map(visit => visit.client), ...pendingDossierAddresses],
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
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ visits: privateVisits, sanispa: sanispaVisits, technicians: team,
      ...(withPending ? { pendingVisits: waitingPrivate, pendingDossiers: waitingSanispa, historyDossiers: historicalSanispa } : {}),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { partner, supabase, user } = await requirePartnerPlanner(request);
    const command = actions.parse(await readJson(request, 22000));
    if (command.action === "routeTour") {
      await rateLimit(supabase, `partner-tour-route:${partner.id}`, 12);
      return NextResponse.json(await getPartnerRoadRoute(command.stops, request.signal),
        { headers: { "Cache-Control": "private, no-store" } });
    }
    if (command.action === "applyTour") {
      await rateLimit(supabase, `partner-tour-apply:${partner.id}`, 12);
      const args = {
        p_partner: partner.id, p_actor: user.id, p_technician: command.technician_id, p_day: command.day, p_stops: command.stops,
      };
      const batch = command.notify_clients ? randomUUID() : null;
      const { data, error } = batch
        ? await supabase.rpc("apply_partner_tour_and_queue", { ...args, p_batch: batch })
        : await supabase.rpc("apply_partner_tour", args);
      const code = error?.message ?? "";
      if (code.includes("TOUR_CHANGED") || error?.code === "40P01" || error?.code === "40001")
        throw new HttpError(409, "Le planning a changé. Rechargez la tournée avant de la valider.", "TOUR_CHANGED");
      if (code.includes("TOUR_STOP_LOCKED"))
        throw new HttpError(409, "Un rendez-vous est déjà commencé ou clôturé. Rechargez la tournée.", "TOUR_CHANGED");
      if (code.includes("TOUR_OVERLAP"))
        throw new HttpError(409, "Un horaire proposé chevauche un autre rendez-vous du technicien.");
      if (code.includes("INVALID_TOUR") || code.includes("TECHNICIAN_NOT_FOUND"))
        throw new HttpError(400, "Vérifiez le jour, les horaires et le technicien de la tournée.");
      if (error) throw interventionError(error);
      if (batch && data.queued > 0) after(async () => {
        try {
          for (let offset = 0; offset < data.queued; offset += 10) await processNotifications(`tour-slot:${batch}:`);
        } catch {
          console.error("Les notifications de tournée seront reprises par la file d’envoi.");
        }
      });
      return NextResponse.json(batch ? data : { updated: data, queued: 0, without_email: 0 });
    }
    await rateLimit(supabase, `partner-private-planner:${partner.id}`, 30);
    const updated_at = new Date().toISOString();
    if (command.action === "completeVisit" || command.action === "validateVisit") {
      const { error } = await supabase.rpc("advance_partner_private_visit", {
        p_partner: partner.id, p_actor: user.id, p_visit: command.id,
        p_expected: command.expected_at, p_validate: command.action === "validateVisit",
      });
      if (error?.message === "PARTNER_WORK_ROLE_REQUIRED") throw new HttpError(403, "Votre compte ne peut pas valider cette intervention.");
      if (error?.message === "PARTNER_VISIT_NOT_FOUND") throw new HttpError(404, "Cette intervention est introuvable.");
      if (error?.message === "PARTNER_VISIT_STATE_CHANGED") throw new HttpError(409, "L’intervention a évolué. Rouvrez la fiche pour retrouver son statut.");
      if (error) throw error;
      return NextResponse.json({ saved: true });
    }
    if (command.action === "deleteClient" || command.action === "restoreClient") {
      const { data, error } = await supabase.from("partner_private_clients")
        .update({ deleted_at: command.action === "deleteClient" ? updated_at : null, updated_at })
        .eq("partner_id", partner.id).eq("id", command.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Cette fiche client est introuvable.");
      return NextResponse.json({ saved: true });
    }
    if (command.action === "deleteVisit") {
      const table = supabase.from("partner_private_visits");
      const removed = await table.delete().eq("partner_id", partner.id).eq("id", command.id)
        .eq("updated_at", command.expected_at).select("id").maybeSingle();
      if (removed.error) throw removed.error;
      if (!removed.data) {
        const current = await table.select("id").eq("partner_id", partner.id).eq("id", command.id).maybeSingle();
        if (current.error) throw current.error;
        if (current.data) throw new HttpError(409, "Cette intervention a été modifiée. Actualisez la page avant de la supprimer.");
      }
      return NextResponse.json({ deleted: true });
    }
    if (command.action === "unplanVisit") {
      const table = supabase.from("partner_private_visits");
      const result = await table.update({ starts_at: null, ends_at: null, updated_at })
        .eq("partner_id", partner.id).eq("id", command.id).eq("updated_at", command.expected_at).not("starts_at", "is", null).is("completed_at", null)
        .select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        const current = await table.select("starts_at").eq("partner_id", partner.id).eq("id", command.id).maybeSingle();
        if (current.error) throw current.error;
        if (!current.data) throw new HttpError(404, "Cette intervention est introuvable.");
        if (current.data.starts_at) throw new HttpError(409, "Le créneau a changé. Actualisez la page avant de déplanifier.");
      }
      return NextResponse.json({ saved: true });
    }
    if (command.action === "createVisitWithClient") {
      validatePrivateVisitTimes(command.visit);
      const location = await locateAddress(command.client);
      const { error } = await supabase.rpc("create_partner_visit_with_contact", {
        p_partner: partner.id, p_actor: user.id, p_client: { ...command.client, ...location },
        p_visit: command.visit,
      });
      if (error?.code === "23503") throw new HttpError(404, "Ce technicien est introuvable dans votre planning.");
      if (error?.code === "23505" || error?.message.includes("APPOINTMENT_CHANGED"))
        throw new HttpError(409, "Cette intervention a déjà été enregistrée ou supprimée. Actualisez la page.");
      if (error) throw interventionError(error);
      return NextResponse.json({ saved: true });
    }
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
      if (error?.message === "PARTNER_VISIT_FINISHED") throw new HttpError(409, "L’intervention a démarré. Son créneau est conservé.");
      if (/APPOINTMENT_CHANGED|partner_private_visits_schedule_pair/.test(error?.message ?? ""))
        throw new HttpError(409, "Ce rendez-vous a été modifié. Le planning a été actualisé.");
      if (error) throw interventionError(error);
      return NextResponse.json({ saved: true });
    }
    if (command.action === "bookTourVisit" || command.action === "schedulePendingVisit") {
      const { error } = await supabase.rpc("book_partner_tour_visit", {
        p_partner: partner.id, p_actor: user.id, p_source: command.source, p_id: command.id,
        p_expected: command.expected_at, p_start: command.starts_at, p_end: command.ends_at, p_technician: command.technician_id,
        ...(command.action === "schedulePendingVisit" ? { p_from_grid: true } : {}),
      });
      if (error?.message.includes("TECHNICIAN_SLOT_OCCUPIED")) throw new HttpError(409, "Ce technicien a déjà un rendez-vous sur ce créneau. Choisissez un autre horaire.");
      if (error?.message.includes("APPOINTMENT_CHANGED")) throw new HttpError(409, "Cette intervention a déjà été modifiée ou planifiée.");
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
      if (position.latitude === null) {
        const approximate = await locateAddress(data, undefined, true);
        return NextResponse.json({ client: { ...data, ...approximate }, approximateLocation: approximate.latitude !== null });
      }
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

    const { action: _action, expected_at, address, ...input } = command;
    validatePrivateVisitTimes(input);
    if (expected_at && address) throw new HttpError(400, "Modifiez l’adresse depuis la fiche client.");
    const table = supabase.from("partner_private_visits");
    const result = expected_at
      ? await table.update({ ...input, updated_at }).eq("partner_id", partner.id).eq("id", input.id)
        .eq("updated_at", expected_at).select("id").maybeSingle()
      : await supabase.rpc("create_partner_visit_for_client", {
        p_partner: partner.id, p_actor: user.id, p_visit: input,
        p_address: address ? { ...address, ...await locateAddress(address) } : null,
      });
    const { error } = result;
    if (error?.message.includes("CLIENT_NOT_FOUND")) throw new HttpError(404, "Client introuvable dans votre carnet.");
    if (error?.message === "PARTNER_VISIT_FINISHED") throw new HttpError(409, "L’intervention a démarré. Son créneau est conservé.");
    if (error?.message.includes("CLIENT_ADDRESS_REQUIRED")) throw new HttpError(400, "Renseignez la rue, le code postal et la ville du client.");
    if (error?.message.includes("CLIENT_ADDRESS_CHANGED"))
      throw new HttpError(409, "L’adresse du client a changé. Rouvrez l’intervention pour utiliser son adresse actuelle.");
    if (error?.code === "23505") throw new HttpError(409, "L’intervention a déjà été enregistrée. Actualisez le planning.");
    if (error?.code === "23503" && error.message.includes("technician")) throw new HttpError(404, "Ce technicien est introuvable dans votre planning.");
    if (error?.code === "23503" && error.message.includes("client_spa")) throw new HttpError(400, "Choisissez un spa de cette fiche client.");
    if (error?.code === "23503") throw new HttpError(404, "Client introuvable dans votre carnet.");
    if (error) throw interventionError(error);
    if (expected_at && !result.data) throw new HttpError(409, "Ce rendez-vous a été modifié. Revenez au planning avant de réessayer.");
    return NextResponse.json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
