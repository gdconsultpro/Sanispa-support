import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { requirePartnerPlanner } from "@/lib/partner-auth";
import { appointmentUnplanReasonKeys } from "@/lib/partner-unplanning";

const command = z.object({
  source: z.enum(["private", "sanispa"]),
  id: z.string().uuid(),
  expected_at: z.string().datetime({ offset: true }),
  reason: z.enum(appointmentUnplanReasonKeys),
  note: z.string().trim().max(300),
}).strict();

export async function POST(request: Request) {
  try {
    const { partner, technicianId, user, supabase } = await requirePartnerPlanner(request);
    if (partner.role !== "technician" || !technicianId)
      throw new HttpError(403, "Ce rendez-vous doit être affecté à votre compte technicien.");
    const values = command.parse(await readJson(request, 2000));
    await rateLimit(supabase, `partner-unplan:${user.id}`, 25);
    const { error } = await supabase.rpc("unplan_partner_technician_appointment", {
      p_partner: partner.id, p_actor: user.id, p_source: values.source, p_id: values.id,
      p_expected: values.expected_at, p_reason: values.reason, p_note: values.note,
    });
    if (error?.message === "FIELD_NOT_FOUND") throw new HttpError(404, "Ce rendez-vous ne figure plus dans votre planning.");
    if (error?.message === "APPOINTMENT_CHANGED") throw new HttpError(409, "Le créneau a changé. Actualisez votre planning avant de réessayer.");
    if (error?.message === "APPOINTMENT_ALREADY_STARTED") throw new HttpError(409, "Cette intervention a déjà démarré. Consultez sa fiche terrain.");
    if (error?.message === "INVALID_UNPLAN_REASON") throw new HttpError(400, "Choisissez un motif de déplanification.");
    if (error) throw error;
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
