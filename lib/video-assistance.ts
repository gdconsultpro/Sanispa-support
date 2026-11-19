import { dossierReference } from "./dossier-reference";
import { z } from "zod";
import { getAuthenticatedPartner } from "./partner-auth";
import { requireUser, rateLimit } from "./client-auth";
import { requireSameOrigin } from "./admin-auth";
import { HttpError, readJson } from "./http";

export const videoRequestSchema = z.object({
  diagnosticId: z.string().uuid().nullable().optional(),
  details: z.string().trim().min(10, "Décrivez votre besoin en quelques mots.").max(1500),
  availability: z.string().trim().min(3, "Indiquez vos disponibilités.").max(500),
}).strict();

export function safeMeetingUrl(input: string) {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (["meet.google.com", "teams.microsoft.com", "teams.live.com", "meet.jit.si", "zoom.us"].includes(host) || host.endsWith(".zoom.us"));
  } catch { return false; }
}

export const videoManagementSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule"), id: z.string().uuid(), version: z.number().int().positive(),
    startsAt: z.string().datetime().refine(value => Date.parse(value) > Date.now(), "Choisissez un créneau à venir."),
    meetingUrl: z.string().trim().url().max(1000).refine(safeMeetingUrl, "Utilisez un lien HTTPS Google Meet, Zoom, Teams ou Jitsi.") }).strict(),
  z.object({ action: z.enum(["complete", "cancel"]), id: z.string().uuid(), version: z.number().int().positive() }).strict(),
]);

export type VideoSession = {
  id: string; audience: "customer" | "partner"; diagnosticId: string | null; partnerId: string | null;
  details: string; availability: string; status: "requested" | "scheduled" | "completed" | "canceled";
  durationMinutes: number; quotedAmount: number | null; collectedAmount: number;
  complimentary: boolean; startsAt: string | null; meetingUrl: string | null; version: number;
  createdAt: string; requesterEmail?: string; dossierReference?: string;
};

export function videoSession(row: any, admin = false): VideoSession {
  return { id: row.id, audience: row.audience, diagnosticId: row.diagnostic_id, partnerId: row.partner_id,
    details: row.details, availability: row.availability, status: row.status, durationMinutes: row.duration_minutes,
    quotedAmount: row.quoted_amount, collectedAmount: row.collected_amount, complimentary: row.billing_mode === "complimentary",
    startsAt: row.starts_at, meetingUrl: row.status === "scheduled" && safeMeetingUrl(row.meeting_url || "") ? row.meeting_url : null,
    version: row.version, createdAt: row.created_at, ...(admin ? { requesterEmail: row.requester_email, dossierReference: row.diagnostic_id ? dossierReference(row.diagnostics) : undefined } : {}) };
}

export function videoError(error: any): never {
  const message = error?.message || "";
  if (/USER_REQUIRED|PARTNER_REQUIRED|DIAGNOSTIC_OWNER_REQUIRED|ADMIN_REQUIRED/.test(message)) throw new HttpError(403, "Vous n’avez pas accès à ce dossier de visio.");
  if (/VIDEO_CONFLICT/.test(message)) throw new HttpError(409, "Cette demande a été modifiée. Actualisez avant de poursuivre.");
  if (/VIDEO_SLOT_UNAVAILABLE/.test(message)) throw new HttpError(409, "Ce créneau est déjà réservé pour une autre visio. Choisissez un autre horaire.");
  if (/VIDEO_NOT_FOUND/.test(message)) throw new HttpError(404, "Demande de visio introuvable.");
  if (/INVALID_|VIDEO_TRANSITION|VIDEO_PAYMENT/.test(message)) throw new HttpError(409, "Cette opération n’est pas disponible dans l’état actuel de la demande.");
  throw error;
}

export async function videoContext(request: Request, audience: "customer" | "partner") {
  if (audience === "customer") return { ...await requireUser(request), partner: null };
  const context = await getAuthenticatedPartner(request);
  if (!context.user || !context.partner) throw new HttpError(401, "Connectez-vous à votre espace partenaire.");
  return { ...context, user: context.user };
}

export async function listVideoRequests(request: Request, audience: "customer" | "partner") {
  const { user, partner, supabase } = await videoContext(request, audience);
  const query = supabase.from("video_assistance_sessions").select("*").eq("requester_id", user.id).eq("audience", audience);
  if (partner) query.eq("partner_id", partner.id);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return { sessions: (data || []).map(row => videoSession(row)) };
}

export async function createVideoRequest(request: Request, audience: "customer" | "partner") {
  requireSameOrigin(request);
  const { user, partner, supabase } = await videoContext(request, audience);
  await rateLimit(supabase, `visio:${user.id}`, 6, 3600);
  const payload = videoRequestSchema.parse(await readJson(request, 7000));
  if (audience === "customer" && !payload.diagnosticId) throw new HttpError(400, "Terminez votre prédiagnostic pour demander une visio.");
  const { data, error } = await supabase.rpc("request_video_assistance", {
    p_user: user.id, p_email: user.email, p_audience: audience, p_partner: partner?.id || null,
    p_diagnostic: payload.diagnosticId || null, p_details: payload.details, p_availability: payload.availability,
  });
  if (error) videoError(error);
  try { const { processNotifications } = await import("./notifications"); await processNotifications(`visio-request:${data.id}`); }
  catch { console.error("Notification visio à relancer"); }
  return { session: videoSession(data) };
}
