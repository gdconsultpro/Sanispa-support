import { NextResponse } from "next/server";
import { requirePremium } from "@/lib/customer-premium";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { careActionSchema } from "@/lib/care";
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requirePremium(request);
    if (new URL(request.url).searchParams.get("overview") === "1") {
      const [reminder, reading] = await Promise.all([
        supabase.from("care_reminders").select("spa_id,title,due_at")
          .eq("user_id", user.id).is("completed_at", null).order("due_at").limit(1).maybeSingle(),
        supabase.from("water_readings").select("spa_id,measured_at,ph,tac,temperature")
          .eq("user_id", user.id).order("measured_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (reminder.error || reading.error) throw reminder.error || reading.error;
      return NextResponse.json({ nextReminder: reminder.data, lastReading: reading.data }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [spas, journal, reminders, readings] = await Promise.all([
      supabase.from("customer_spas").select("id,brand,model").eq("user_id", user.id).order("created_at"),
      supabase.from("care_journal").select("id,spa_id,kind,performed_at,note").eq("user_id", user.id).order("performed_at", { ascending: false }).limit(200),
      supabase.from("care_reminders").select("id,spa_id,kind,title,due_at,repeat_days,repeat_months,repeat_years,completed_at,version").eq("user_id", user.id).is("completed_at", null).order("due_at").limit(200),
      supabase.from("water_readings").select("id,spa_id,measured_at,volume_litres,temperature,ph,tac,disinfectant,disinfectant_value,product,note").eq("user_id", user.id).order("measured_at", { ascending: false }).limit(200),
    ]);
    for (const r of [spas, journal, reminders, readings]) if (r.error) throw r.error;
    return NextResponse.json({ spas: spas.data, journal: journal.data, reminders: reminders.data, readings: readings.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requirePremium(request);
    await rateLimit(supabase, `care:${user.id}`, 30);
    const p = careActionSchema.parse(await readJson(request, 10000));
    if (p.action === "complete") {
      const r = await supabase.rpc("complete_care_reminder", { p_id: p.id, p_user: user.id, p_version: p.version });
      if (r.error) throw new HttpError(409, "Ce rappel a changé. Actualisez avant de poursuivre.");
    } else if (p.action === "edit-reminder") {
      // Advancing the version also invalidates any e-mail queued for the old schedule.
      const result = await supabase.from("care_reminders")
        .update({
          due_at: p.date,
          repeat_days: p.repeatDays,
          repeat_months: p.repeatMonths,
          repeat_years: p.repeatYears,
          version: p.version + 1,
        })
        .eq("id", p.id)
        .eq("user_id", user.id)
        .eq("version", p.version)
        .is("completed_at", null)
        .select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) throw new HttpError(409, "Ce rappel a changé ou n’est plus disponible. Actualisez le carnet avant de réessayer.");
    } else if (p.action === "delete") {
      const table = { journal: "care_journal", reminder: "care_reminders", reading: "water_readings" }[p.type];
      const r = await supabase.from(table).delete().eq("id", p.id).eq("user_id", user.id).select("id");
      if (r.error) throw r.error;
      if (!r.data?.length) throw new HttpError(404, "Élément introuvable.");
    } else {
      const spa = await supabase.from("customer_spas").select("id").eq("id", p.spaId).eq("user_id", user.id).maybeSingle();
      if (spa.error) throw spa.error;
      if (!spa.data) throw new HttpError(404, "Spa introuvable pour ce compte.");
      const table = p.action === "journal" ? "care_journal" : p.action === "reminder" ? "care_reminders" : "water_readings";
      const details = p.action === "journal" ? { kind: p.kind, performed_at: p.date, note: p.note }
        : p.action === "reminder" ? {
          kind: p.kind, title: p.title, due_at: p.date,
          repeat_days: p.repeatDays, repeat_months: p.repeatMonths, repeat_years: p.repeatYears,
        }
        : { measured_at: p.date, volume_litres: p.volume, temperature: p.temperature, ph: p.ph, tac: p.tac, disinfectant: p.disinfectant, disinfectant_value: p.disinfectantValue, product: p.product, note: p.note };
      const r = await supabase.from(table).insert({ user_id: user.id, spa_id: p.spaId, ...details }).select("id").single();
      if (r.error) throw r.error;
    }
    return NextResponse.json({ saved: true });
  } catch (e) { return apiError(e); }
}
