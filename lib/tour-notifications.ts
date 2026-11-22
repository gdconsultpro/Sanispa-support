import { z } from "zod";
import type { getSupabaseAdmin } from "./supabase";

const payloadSchema = z.object({
  source: z.enum(["private", "sanispa"]),
  appointmentId: z.string().uuid(),
  partnerId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  version: z.string().datetime({ offset: true }),
});
const emailSchema = z.string().trim().email();

export async function tourNotificationDetails(supabase: ReturnType<typeof getSupabaseAdmin>, payload: unknown,
  confirmedRecipient: (userId: string) => Promise<string | null>) {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success || Date.parse(parsed.data.startsAt) <= Date.now()) return null;
  const { source, appointmentId, partnerId, startsAt, endsAt, version } = parsed.data;
  const partnerQuery = supabase.from("partners").select("company_name,email").eq("id", partnerId).eq("active", true).maybeSingle();
  const fields = "starts_at,ends_at,updated_at";
  let recipient: string | null = null;
  let attachedDossier: string | undefined;
  let partner: { company_name: string; email: string | null } | null;
  if (source === "private") {
    const [company, visit] = await Promise.all([
      partnerQuery,
      supabase.from("partner_private_visits").select(fields + ",client:partner_private_clients!inner(email)")
        .eq("id", appointmentId).eq("partner_id", partnerId).eq("client.partner_id", partnerId)
        .eq("starts_at", startsAt).eq("ends_at", endsAt).eq("updated_at", version)
        .maybeSingle<{ client: { email: string } }>(),
    ]);
    if (company.error || visit.error) throw company.error || visit.error;
    partner = company.data;
    recipient = visit.data?.client?.email ?? null;
  } else {
    const [company, visit] = await Promise.all([
      partnerQuery,
      supabase.from("partner_appointments").select(fields + ",diagnostic:diagnostics!inner(user_id,customer:customers(email))")
        .eq("diagnostic_id", appointmentId).eq("partner_id", partnerId).eq("diagnostic.assigned_partner_id", partnerId)
        .is("diagnostic.archived_at", null).not("diagnostic.status", "in", "(CLOSED,terminé)")
        .eq("starts_at", startsAt).eq("ends_at", endsAt).eq("updated_at", version)
        .maybeSingle<{ diagnostic: { user_id: string | null; customer: { email: string } | null } }>(),
    ]);
    if (company.error || visit.error) throw company.error || visit.error;
    partner = company.data;
    const diagnostic = visit.data?.diagnostic;
    if (partner && diagnostic?.user_id) {
      recipient = await confirmedRecipient(diagnostic.user_id);
      attachedDossier = appointmentId;
    } else {
      recipient = diagnostic?.customer?.email ?? null;
    }
  }
  const email = emailSchema.safeParse(recipient);
  if (!partner || !email.success) return null;
  return { email: email.data, partnerName: partner.company_name, replyTo: emailSchema.safeParse(partner.email).data,
    startsAt, endsAt, diagnosticId: attachedDossier };
}
