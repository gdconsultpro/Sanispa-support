import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { requirePartnerPlanner } from "@/lib/partner-auth";
import { planningDurations, planningTypeKey, type TechnicianAbsence, type WeeklyHours } from "@/lib/partner-availability";

const uuid = z.string().uuid();
const date = z.string().date();
const minutes = z.coerce.number().int().min(1).max(720);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timestamp = z.string().datetime({ offset: true });
const label = z.string().trim().min(1).max(140);
const weeklyHours = z.array(z.object({ weekday: z.number().int().min(1).max(7), start: clock, end: clock }).strict()).max(14)
  .transform(hours => hours.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)))
  .refine(hours => hours.every((item, index) => item.start < item.end &&
    (hours[index - 1]?.weekday !== item.weekday || hours[index - 1].end <= item.start)), "Vérifiez l’ordre des horaires et les chevauchements.");
const absenceKey = z.object({ technician_id: uuid, id: uuid });
const commands = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveDuration"), label, duration_minutes: z.number().int().min(1).max(720) }).strict(),
  z.object({ action: z.literal("removeDuration"), label }).strict(),
  z.object({ action: z.literal("saveHours"), technician_id: uuid, hours: weeklyHours }).strict(),
  absenceKey.extend({ action: z.literal("saveAbsence"), starts_at: timestamp, ends_at: timestamp, label: z.string().trim().max(100) }).strict(),
  absenceKey.extend({ action: z.literal("removeAbsence") }).strict(),
]);
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const { partner, supabase } = await requirePartnerPlanner(request);
    const params = new URL(request.url).searchParams;
    if (params.has("day")) {
      const day = date.parse(params.get("day"));
      const duration = minutes.parse(params.get("duration"));
      const technician = uuid.nullable().parse(params.get("technician"));
      const after = timestamp.nullable().parse(params.get("after"));
      await rateLimit(supabase, `partner-slot-suggestions:${partner.id}`, 60);
      const result = await supabase.rpc("suggest_partner_appointment_slots", {
        p_partner: partner.id, p_technician: technician, p_day: day, p_duration: duration, p_after: after,
      });
      if (result.error) throw result.error;
      return NextResponse.json({ slots: result.data ?? [] }, { headers });
    }

    const [types, team, schedules, absences] = await Promise.all([
      supabase.from("partner_intervention_durations").select("label,duration_minutes").eq("partner_id", partner.id).order("label"),
      supabase.from("partner_planning_technicians").select("id,name").eq("partner_id", partner.id).order("name").order("id"),
      supabase.from("partner_technician_workweeks").select("technician_id,hours").eq("partner_id", partner.id),
      supabase.from("partner_technician_absences").select("technician_id,id,starts_at,ends_at,label").eq("partner_id", partner.id)
        .gt("ends_at", new Date().toISOString()).order("starts_at").order("id"),
    ]);
    for (const result of [types, team, schedules, absences]) if (result.error) throw result.error;
    const hoursByTechnician = new Map<string, WeeklyHours[]>(schedules.data!.map(row => [row.technician_id, row.hours]));
    const absencesByTechnician = new Map<string, TechnicianAbsence[]>();
    for (const { technician_id, ...absence } of absences.data!) {
      const previous = absencesByTechnician.get(technician_id);
      if (previous) previous.push(absence);
      else absencesByTechnician.set(technician_id, [absence]);
    }
    return NextResponse.json({
      durations: planningDurations(types.data!),
      customizedTypes: types.data!.map(row => planningTypeKey(row.label)),
      team: team.data!.map(member => ({
        ...member, hours: hoursByTechnician.get(member.id) ?? null, absences: absencesByTechnician.get(member.id) ?? [],
      })),
      canManage: partner.role === "owner",
    }, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { partner, supabase } = await requirePartnerPlanner(request);
    if (partner.role !== "owner") throw new HttpError(403, "Seul le responsable du compte peut modifier ces réglages.");
    const command = commands.parse(await readJson(request, 6000));
    await rateLimit(supabase, `partner-planning-resources:${partner.id}`, 40);
    const partner_id = partner.id;
    if (command.action === "saveDuration" || command.action === "removeDuration") {
      const type_key = planningTypeKey(command.label);
      const table = supabase.from("partner_intervention_durations");
      const result = command.action === "saveDuration"
        ? await table.upsert({ partner_id, type_key, label: command.label, duration_minutes: command.duration_minutes })
        : await table.delete().eq("partner_id", partner_id).eq("type_key", type_key);
      if (result.error) throw result.error;
    } else if (command.action === "saveHours") {
      const result = await supabase.from("partner_technician_workweeks")
        .upsert({ partner_id, technician_id: command.technician_id, hours: command.hours });
      if (result.error?.code === "23503") throw new HttpError(404, "Technicien introuvable dans votre entreprise.");
      if (result.error) throw result.error;
    } else {
      const table = supabase.from("partner_technician_absences");
      const { technician_id, id } = command;
      if (command.action === "saveAbsence" && Date.parse(command.starts_at) >= Date.parse(command.ends_at))
        throw new HttpError(400, "La fin de l’absence doit être après le début.");
      const result = command.action === "removeAbsence"
        ? await table.delete().eq("partner_id", partner_id).eq("technician_id", technician_id).eq("id", id)
        : await table.upsert({ id, partner_id, technician_id, starts_at: command.starts_at, ends_at: command.ends_at, label: command.label });
      if (result.error?.code === "23503") throw new HttpError(404, "Technicien introuvable dans votre entreprise.");
      if (result.error) throw result.error;
    }
    return NextResponse.json({ saved: true }, { headers });
  } catch (error) { return apiError(error); }
}
