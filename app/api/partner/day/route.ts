import { NextResponse } from "next/server";
import { problemLabel } from "@/lib/display-labels";
import { apiError } from "@/lib/http";
import { requirePartnerPlanner } from "@/lib/partner-auth";
import { partnerDayRange, type PartnerDay, type PartnerDayAppointment } from "@/lib/partner-day";
import { partnerClientAddress, type PrivatePartnerClient, type SanispaPartnerVisit } from "@/lib/partner-planner";
import { privateWorkStatus, sanispaWorkStatus } from "@/lib/partner-workspace";

const headers = { "Cache-Control": "private, no-store" };
const related = <T,>(row: T | T[] | null) => Array.isArray(row) ? row[0] : row;

export async function GET(request: Request) {
  try {
    const { partner, user, supabase } = await requirePartnerPlanner(request);
    const now = new Date();
    const { day, from, to } = partnerDayRange(now);
    let scope: PartnerDay["scope"] = "team";
    let technician: string | null = null;
    if (partner.role !== "owner") {
      const membership = await supabase.from("partner_users").select("technician_id").eq("partner_id", partner.id)
        .eq("user_id", user.id).eq("active", true).maybeSingle();
      if (membership.error) throw membership.error;
      technician = membership.data?.technician_id ?? null;
      if (!technician) return NextResponse.json({ day, scope: "unlinked", appointments: [] } satisfies PartnerDay, { headers });
      scope = "personal";
    }
    let privateVisits = supabase.from("partner_private_visits")
      .select("id,title,starts_at,ends_at,technician_id,completed_at,validated_at,field_started_at,client:partner_private_clients!inner(name,phone,street,postal_code,city)")
      .eq("partner_id", partner.id).eq("client.partner_id", partner.id).lt("starts_at", to).gt("ends_at", from);
    let sanispaVisits = supabase.from("partner_appointments")
      .select("diagnostic_id,starts_at,ends_at,technician_id,diagnostic:diagnostics!inner(problem_type,status,intervened_at,created_at,customer:customers(name,address,phone),intervention_reports(performed_at,submitted_at,client_validated_at,client_outcome),partner_field_sessions(appointment_start,submitted_at))")
      .eq("partner_id", partner.id).eq("diagnostic.assigned_partner_id", partner.id).is("diagnostic.archived_at", null)
      .eq("diagnostic.intervention_reports.partner_id", partner.id).eq("diagnostic.partner_field_sessions.partner_id", partner.id)
      .lt("starts_at", to).gt("ends_at", from);
    if (technician) {
      privateVisits = privateVisits.eq("technician_id", technician);
      sanispaVisits = sanispaVisits.eq("technician_id", technician);
    }
    const [privateRows, sanispaRows, lines] = await Promise.all([
      privateVisits.order("starts_at").order("id"),
      sanispaVisits.order("starts_at").order("diagnostic_id"),
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
          technician: names.get(row.technician_id) ?? null, status: privateWorkStatus(row, +now),
        };
      }),
      ...sanispaRows.data!.map(row => {
        type Customer = { name: string | null; address: string | null; phone: string | null };
        const dossier = related(row.diagnostic) as unknown as Omit<SanispaPartnerVisit["diagnostic"], "customer"> & { customer: Customer | Customer[] | null };
        const customer = related(dossier.customer);
        const visit = { ...row, diagnostic: { ...dossier, customer } } as SanispaPartnerVisit;
        return {
          id: row.diagnostic_id, source: "sanispa" as const, title: problemLabel(dossier.problem_type), customer: customer?.name || "Client",
          phone: customer?.phone ?? null, address: customer?.address ?? "", starts_at: row.starts_at, ends_at: row.ends_at,
          technician: names.get(row.technician_id) ?? null, status: sanispaWorkStatus(visit.diagnostic, visit, +now).workStatus,
        };
      }),
    ].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id));
    return NextResponse.json({ day, scope, appointments } satisfies PartnerDay, { headers });
  } catch (error) { return apiError(error); }
}
