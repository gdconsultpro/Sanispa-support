import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartnerApprovalEmail } from "./types";

export async function loadAdminPartnerApprovalEmails(supabase: SupabaseClient, partnerIds: string[]) {
  const emails = new Map<string, PartnerApprovalEmail>();
  if (!partnerIds.length) return emails;

  const { data, error } = await supabase.rpc("admin_partner_approval_email_statuses", {
    p_partners: partnerIds,
  });
  if (error) return null;

  for (const { partner_id, state, sent_at } of (data ?? []) as (PartnerApprovalEmail & { partner_id: string })[]) {
    emails.set(partner_id, { state, sent_at });
  }
  return emails;
}
