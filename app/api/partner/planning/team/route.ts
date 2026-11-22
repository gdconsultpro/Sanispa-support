import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { requirePartnerPlanner } from "@/lib/partner-auth";

const headers = { "Cache-Control": "private, no-store" };
const uuid = z.string().uuid();
const command = z.object({
  user_id: uuid, technician_id: uuid.nullable(), expected: uuid.nullable(),
}).strict();

async function requireTeamOwner(request: Request) {
  const context = await requirePartnerPlanner(request);
  if (context.partner.role !== "owner") throw new HttpError(403, "Seul le responsable peut gérer les comptes de l’équipe.");
  return context;
}

export async function GET(request: Request) {
  try {
    const { partner, supabase } = await requireTeamOwner(request);
    const [lines, members] = await Promise.all([
      supabase.from("partner_planning_technicians").select("id,name").eq("partner_id", partner.id).order("name").order("id"),
      supabase.from("partner_users").select("user_id,contact_name,active,technician_id").eq("partner_id", partner.id)
        .eq("role", "technician").order("contact_name").order("user_id"),
    ]);
    if (lines.error || members.error) throw lines.error || members.error;
    const names = new Map<string, number>();
    for (const member of members.data!) {
      const name = member.contact_name?.trim().toLocaleLowerCase("fr-FR");
      if (name) names.set(name, (names.get(name) ?? 0) + 1);
    }
    const accounts = await Promise.all(members.data!.map(async member => {
      const { contact_name, ...row } = member;
      const name = contact_name?.trim() || "";
      const disambiguate = !name || (names.get(name.toLocaleLowerCase("fr-FR")) ?? 0) > 1;
      const email = disambiguate ? (await supabase.auth.admin.getUserById(row.user_id)).data?.user?.email : null;
      return { ...row, name: [name, email].filter(Boolean).join(" · ") || "Compte " + row.user_id.slice(0, 8) };
    }));
    return NextResponse.json({ technicians: lines.data, accounts }, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { partner, supabase, user } = await requireTeamOwner(request);
    const fields = command.parse(await readJson(request, 3000));
    await rateLimit(supabase, `partner-team-links:${partner.id}`, 40);
    const { error } = await supabase.rpc("set_partner_technician_account", {
      p_partner: partner.id, p_actor: user.id, p_user: fields.user_id, p_technician: fields.technician_id, p_expected: fields.expected,
    });
    if (error?.code === "23505") throw new HttpError(409, "Cette ligne est déjà liée à un autre compte technicien.");
    if (error?.code === "23503") throw new HttpError(404, "Cette ligne est introuvable dans votre planning.");
    if (error?.message === "TECHNICIAN_LINK_CHANGED") throw new HttpError(409, "Le rattachement a changé. Actualisez l’équipe et réessayez.");
    if (error?.message === "TECHNICIAN_ACCOUNT_REQUIRED") throw new HttpError(404, "Ce compte technicien est introuvable ou désactivé.");
    if (error?.message === "PARTNER_OWNER_REQUIRED" || error?.message === "FIELD_ACCESS_REQUIRED")
      throw new HttpError(403, "Seul le responsable peut gérer les comptes de l’équipe.");
    if (error) throw error;
    return NextResponse.json({ saved: true }, { headers });
  } catch (error) { return apiError(error); }
}
