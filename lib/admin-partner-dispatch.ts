import { leadCatalog } from "./partner-catalog";
import { z } from "zod";
import { parseLocation } from "./partner-leads";
import { statusLabel } from "./display-labels";
import { HttpError } from "./http";
import { partnerDispatchDecision, partnerLeadStatuses } from "./partner-release";
export const dispatchCommand = z.union([
  z.object({ action: z.literal("keep") }).strict(),
  z
    .object({
      action: z.literal("release").default("release"),
      partnerId: z.string().uuid(),
      category: z.enum(
        Object.keys(leadCatalog) as [
          keyof typeof leadCatalog,
          ...(keyof typeof leadCatalog)[],
        ],
      ),
      description: z
        .string()
        .trim()
        .min(20)
        .max(1500)
        .refine(
          (value) =>
            !/[\w.+-]+@[\w.-]+|(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}|https?:\/\//i.test(
              value,
            ),
          "Retirez les coordonnées du descriptif.",
        ),
      photos: z.array(z.string().max(1000)).max(5),
    })
    .strict(),
]);

export async function loadPartnerDispatch(supabase: any, id: string) {
  const { data: d, error } = await supabase
    .from("diagnostics")
    .select(
      "choice,request_type,status,archived_at,department,problem_type,partner_kept_at,partner_kept_by,partner_released_at,partner_released_by,partner_received_at,matched_partner_ids,assigned_partner_id,intervened_at,intervened_partner_id,lead_category,preview_description,preview_photo_paths,diagnostic_photos(storage_path,photo_type),customers(address,spa_brand,spa_model)",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  const tracking = Boolean(d.partner_released_at && !d.partner_kept_at);
  const [sector, purchases, notification, refusal, unlocked, appointment] = await Promise.all([
    supabase
      .from("partner_departments")
      .select("partners!inner(id,company_name,active,verification_status,leads_paid)")
      .eq("department", d.department),
    supabase
      .from("lead_purchases")
      .select("status")
      .eq("request_id", id)
      .in("status", ["pending", "paid", "granted"])
      .limit(1),
    d.partner_released_at && d.matched_partner_ids?.[0]
      ? supabase
          .from("notification_jobs")
          .select("state,sent_at,payload")
          .eq("key", `${id}:manual-partner:${d.matched_partner_ids[0]}`)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    d.partner_released_at || d.partner_kept_at || d.assigned_partner_id
      ? Promise.resolve({ data: null, error: null })
      : supabase.from("diagnostic_activity").select("created_at,metadata")
        .eq("diagnostic_id", id).eq("event_type", "partner_declined").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    tracking && d.assigned_partner_id
      ? supabase.from("lead_purchases").select("status,payment_required,paid_at,purchased_at")
        .eq("request_id", id).eq("partner_id", d.assigned_partner_id).in("status", ["paid", "granted"])
        .order("purchased_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tracking && d.assigned_partner_id
      ? supabase.from("partner_appointments").select("starts_at,updated_at").eq("diagnostic_id", id).eq("partner_id", d.assigned_partner_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const loadError = sector.error || purchases.error || notification.error || refusal.error || unlocked.error || appointment.error;
  if (loadError) throw loadError;
  const coveringPartners = (sector.data ?? []).map((row: any) => Array.isArray(row.partners) ? row.partners[0] : row.partners).filter(Boolean);
  const partners = coveringPartners.filter((partner: any) => partner.active && partner.verification_status !== "pending");
  const pendingPartners = coveringPartners.filter((partner: any) => partner.active && partner.verification_status === "pending");
  const inactivePartners = coveringPartners.filter((partner: any) => !partner.active);
  const customer = Array.isArray(d.customers) ? d.customers[0] : d.customers;
  const location = parseLocation(customer?.address, d.department);
  const decision = partnerDispatchDecision({
    ...d,
    lead_purchase: purchases.data?.[0],
  });
  const statusAllowsRelease = partnerLeadStatuses.includes(d.status);
  const paidAt = unlocked.data?.status === "paid" ? unlocked.data.paid_at : null;
  const free = unlocked.data?.status === "granted" && unlocked.data.payment_required === false;
  const unlockAt = paidAt || (free ? unlocked.data.purchased_at : null);
  return {
    decision,
    assigned: Boolean(d.assigned_partner_id),
    progress: tracking ? {
      received: Boolean(d.partner_received_at || d.assigned_partner_id),
      receivedAt: d.partner_received_at || unlockAt,
      unlocked: Boolean(d.assigned_partner_id),
      unlockAt,
      payment: paidAt ? "paid" as const : free ? "free" as const : null,
      appointmentAt: appointment.data?.starts_at ?? null,
      appointmentConfirmedAt: appointment.data?.updated_at ?? null,
      completedAt: d.intervened_partner_id && d.intervened_partner_id === d.assigned_partner_id ? d.intervened_at : null,
    } : null,
    declined: refusal.data ? { at: refusal.data.created_at, company: refusal.data.metadata?.company_name || null } : null,
    blockedReason: d.archived_at ? "Restaurez ce dossier avant de le proposer." : !statusAllowsRelease
      ? "Le statut « " + statusLabel(d.status) + " » bloque la diffusion. Traitez le dossier ou placez-le en analyse si la demande est toujours ouverte."
      : !d.department ? "Renseignez le département d’intervention pour sélectionner un partenaire."
      : !partners.length
        ? pendingPartners.length ? "Des entreprises couvrent ce département. Leur vérification reste à terminer."
          : inactivePartners.length ? "Les entreprises qui couvrent ce département sont désactivées."
          : "Aucun partenaire ne couvre ce département."
        : null,
    pendingPartners: pendingPartners.map((partner: any) => partner.company_name),
    decidedAt: d.partner_kept_at || d.partner_released_at || null,
    selectedPartner:
      notification.data?.payload?.partners?.[0]?.companyName || null,
    canKeep: decision === "pending" && !d.archived_at,
    canRelease:
      decision === "pending" &&
      !d.archived_at &&
      statusAllowsRelease,
    notification: notification.data
      ? { state: notification.data.state, sentAt: notification.data.sent_at }
      : null,
    preview: {
      category: d.lead_category || (Object.hasOwn(leadCatalog, d.problem_type || "") ? d.problem_type : ""),
      city: location.city,
      postalCode: location.postalCode,
      spa: [customer?.spa_brand, customer?.spa_model].filter(Boolean).join(" "),
      description: d.preview_description || "",
      photos: d.preview_photo_paths || [],
      availablePhotos: d.diagnostic_photos || [],
    },
    partners,
  };
}

/** Administrator identity must be verified by the route, then checked again by the database. */
export async function decidePartnerDispatch(
  supabase: any,
  id: string,
  actor: string,
  command: z.infer<typeof dispatchCommand>,
) {
  if (command.action === "keep") {
    const result = await supabase.rpc("keep_partner_intervention", {
      p_diagnostic: id,
      p_actor: actor,
    });
    if (result.error) throw decisionError(result.error);
    return { changed: !result.data?.alreadyKept, notificationKey: null };
  }
  const result = await supabase.rpc("publish_partner_offer", {
    p_diagnostic: id,
    p_partner: command.partnerId,
    p_actor: actor,
    p_category: command.category,
    p_description: command.description,
    p_photos: command.photos,
  });
  if (result.error) throw decisionError(result.error);
  return {
    changed: true,
    notificationKey: result.data?.notificationKey || null,
  };
}
function decisionError(error: { message?: string }) {
  const code = error.message || "";
  const reason = code.includes("PARTNER_VERIFICATION_REQUIRED") ? "Vérifiez d’abord les coordonnées et le SIRET de ce partenaire dans l’administration." : code.includes("KEPT_BY_SANISPA")
    ? "Ce dossier est conservé chez SANISPA."
    : code.includes("ALREADY_RELEASED")
      ? "Ce dossier a déjà été transmis. Son destinataire est conservé."
      : code.includes("ACQUISITION_STARTED")
        ? "Une réservation ou une attribution existe déjà. Ses conditions sont conservées."
        : code.includes("PARTNER_INELIGIBLE")
          ? "Ce partenaire n’est plus actif ou ne couvre pas le département du dossier."
          : "Cette décision n’est pas disponible pour ce dossier ou son statut actuel.";
  return new HttpError(
    409,
    `${reason} Actualisez le dossier avant de poursuivre.`,
  );
}
