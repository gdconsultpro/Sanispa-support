import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/client-auth";
import { apiError, HttpError } from "@/lib/http";

const columns = "id,public_reference,created_at,status,problem_type,choice,payment_status,intervened_at,intervened_company_name,assigned_partner:partners!diagnostics_assigned_partner_id_fkey(company_name)";
const followUpColumns = [
  "assigned_at",
  "appointment:partner_appointments(starts_at,ends_at,updated_at)",
  "reports:intervention_reports(submitted_at,client_validated_at,client_outcome)",
  "invoices:client_documents(created_at)",
  "updates:diagnostic_activity(created_at)",
  "visios:video_assistance_sessions(status,starts_at,updated_at)",
].join(",");

export async function GET(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user?.email) throw new HttpError(401, "Connectez-vous pour consulter vos demandes.");
    const params = new URL(request.url).searchParams;
    const followUp = params.get("followUp") === "1";
    const requestedId = params.get("id");
    const id = requestedId ? z.string().uuid().parse(requestedId) : null;
    let query = supabase.from("diagnostics").select(followUp ? columns + "," + followUpColumns : columns)
      .eq("user_id", user.id).order("created_at", { ascending: false });
    if (id) query = query.eq("id", id);
    if (followUp) {
      query = query.is("archived_at", null)
        .order("submitted_at", { referencedTable: "reports", ascending: false }).limit(1, { referencedTable: "reports" })
        .eq("invoices.user_id", user.id)
        .eq("invoices.document_type", "Facture d’intervention").in("invoices.issued_by", ["sanispa", "partner"])
        .order("created_at", { referencedTable: "invoices", ascending: false }).limit(1, { referencedTable: "invoices" })
        .in("updates.event_type", ["status_changed", "partner_assigned", "appointment_scheduled", "intervention_report_submitted", "client_intervention_validated", "intervention_completed"])
        .order("created_at", { referencedTable: "updates", ascending: false }).limit(1, { referencedTable: "updates" })
        .eq("visios.requester_id", user.id).in("visios.status", ["requested", "scheduled"])
        .order("updated_at", { referencedTable: "visios", ascending: false }).limit(1, { referencedTable: "visios" });
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ diagnostics: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
