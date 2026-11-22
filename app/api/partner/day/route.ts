import { NextResponse } from "next/server";
import { z } from "zod";
import { problemLabel } from "@/lib/display-labels";
import { apiError, HttpError } from "@/lib/http";
import { requirePartnerPlanner } from "@/lib/partner-auth";
import { partnerDayRange, type PartnerDay, type PartnerDayAppointment } from "@/lib/partner-day";
import { partnerClientAddress, type PrivatePartnerClient, type SanispaPartnerVisit } from "@/lib/partner-planner";
import { privateWorkStatus, sanispaWorkStatus } from "@/lib/partner-workspace";

const scheduleViews = z.enum(["today", "upcoming", "history"]);
const scheduleCursor = z.object({ start: z.string().datetime({ offset: true }), id: z.string().uuid() });
const pageSize = 30;
const headers = { "Cache-Control": "private, no-store" };
const related = <T,>(row: T | T[] | null) => Array.isArray(row) ? row[0] : row;

export async function GET(request: Request) {
  try {
    const { partner, technicianId, supabase } = await requirePartnerPlanner(request);
    const now = new Date();
    const { day, from, to } = partnerDayRange(now);
    const params = new URL(request.url).searchParams;
    const view = scheduleViews.parse(params.get("view") ?? "today");
    const personal = partner.role !== "owner";
    if (!personal && view !== "today") throw new HttpError(400, "Utilisez le planning de l’équipe.");
    if (personal && !technicianId)
      return NextResponse.json({ day, scope: "unlinked", appointments: [] } satisfies PartnerDay, { headers });
    const scope = personal ? "personal" : "team";
    const ascending = view !== "history";
    const cursor = params.has("start") || params.has("id")
      ? scheduleCursor.parse({ start: params.get("start"), id: params.get("id") }) : null;
    let privateVisits = supabase.from("partner_private_visits")
      .select("id,title,starts_at,ends_at,technician_id,updated_at,completed_at,validated_at,field_started_at,client:partner_private_clients!inner(name,phone,street,postal_code,city)")
      .eq("partner_id", partner.id).eq("client.partner_id", partner.id);
    let sanispaVisits = supabase.from("partner_appointments")
      .select("diagnostic_id,starts_at,ends_at,technician_id,updated_at,diagnostic:diagnostics!inner(problem_type,status,intervened_at,created_at,customer:customers(name,address,phone),intervention_reports(performed_at,submitted_at,client_validated_at,client_outcome),partner_field_sessions(appointment_start,submitted_at))")
      .eq("partner_id", partner.id).eq("diagnostic.assigned_partner_id", partner.id).is("diagnostic.archived_at", null)
      .eq("diagnostic.intervention_reports.partner_id", partner.id).eq("diagnostic.partner_field_sessions.partner_id", partner.id);
    if (personal && technicianId) {
      privateVisits = privateVisits.eq("technician_id", technicianId);
      sanispaVisits = sanispaVisits.eq("technician_id", technicianId);
    }
    if (view === "today") {
      privateVisits = privateVisits.lt("starts_at", to).gt("ends_at", from);
      sanispaVisits = sanispaVisits.lt("starts_at", to).gt("ends_at", from);
    } else {
      const bound = view === "history" ? "lte" : "gt";
      privateVisits = privateVisits[bound]("ends_at", now.toISOString()).limit(pageSize + 1);
      sanispaVisits = sanispaVisits[bound]("ends_at", now.toISOString()).limit(pageSize + 1);
      if (cursor) {
        const op = ascending ? "gt" : "lt";
        privateVisits = privateVisits.or(`starts_at.${op}.${cursor.start},and(starts_at.eq.${cursor.start},id.${op}.${cursor.id})`);
        sanispaVisits = sanispaVisits.or(`starts_at.${op}.${cursor.start},and(starts_at.eq.${cursor.start},diagnostic_id.${op}.${cursor.id})`);
      }
    }
    const [privateRows, sanispaRows, lines] = await Promise.all([
      privateVisits.order("starts_at", { ascending }).order("id", { ascending }),
      sanispaVisits.order("starts_at", { ascending }).order("diagnostic_id", { ascending }),
      scope === "team" ? supabase.from("partner_planning_technicians").select("id,name").eq("partner_id", partner.id) : null,
    ]);
    if (privateRows.error || sanispaRows.error || lines?.error) throw privateRows.error || sanispaRows.error || lines?.error;
    const names = new Map((lines?.data ?? []).map(row => [row.id, row.name]));
    const appointments: PartnerDayAppointment[] = [
      ...privateRows.data!.map(row => {
        const customer = related(row.client) as Pick<PrivatePartnerClient, "name" | "phone" | "street" | "postal_code" | "city">;
        return {
          id: row.id, source: "private" as const, title: row.title, customer: customer.name, phone: customer.phone,
          address: partnerClientAddress(customer), starts_at: row.starts_at, ends_at: row.ends_at,
          technician: names.get(row.technician_id) ?? null, status: privateWorkStatus(row, +now), version: row.updated_at,
          canUnplan: personal && !row.completed_at && !row.field_started_at,
        };
      }),
      ...sanispaRows.data!.map(row => {
        type Customer = { name: string | null; address: string | null; phone: string | null };
        const dossier = related(row.diagnostic) as unknown as Omit<SanispaPartnerVisit["diagnostic"], "customer"> & { customer: Customer | Customer[] | null };
        const customer = related(dossier.customer);
        const visit = { ...row, diagnostic: { ...dossier, customer } } as SanispaPartnerVisit;
        const { workStatus } = sanispaWorkStatus(visit.diagnostic, visit, +now);
        return {
          id: row.diagnostic_id, source: "sanispa" as const, title: problemLabel(dossier.problem_type), customer: customer?.name || "Client",
          phone: customer?.phone ?? null, address: customer?.address ?? "", starts_at: row.starts_at, ends_at: row.ends_at,
          technician: names.get(row.technician_id) ?? null, status: workStatus, version: row.updated_at,
          canUnplan: personal && (workStatus === "scheduled" || workStatus === "due") &&
            !dossier.intervened_at && !dossier.intervention_reports?.length &&
            !dossier.partner_field_sessions?.some(session => session.submitted_at === null),
        };
      }),
    ].sort((a, b) => (ascending ? 1 : -1) * (Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)));
    const more = view !== "today" && appointments.length > pageSize;
    return NextResponse.json({ day, scope, appointments: more ? appointments.slice(0, pageSize) : appointments, more } satisfies PartnerDay, { headers });
  } catch (error) { return apiError(error); }
}
