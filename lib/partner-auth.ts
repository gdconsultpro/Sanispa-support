import { getAuthenticatedUser } from "./client-auth";

export type AuthenticatedPartner = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string;
  active: boolean;
  role: string;
  leads_paid: boolean;
};

export async function getAuthenticatedPartner(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return { user: null, partner: null, supabase };

  const { data: link, error: partnerError } = await supabase
    .from("partner_users")
    .select("role, active, partners!inner(id, company_name, contact_name, email, active, leads_paid)")
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("partners.active", true)
    .maybeSingle();

  if (partnerError) {
    console.error("[partner-auth] Partner lookup failed", {
      userId: user.id,
      error: partnerError.message
    });
    return { user: user, partner: null, supabase };
  }

  const row = link as any;
  const partnerRow = Array.isArray(row?.partners) ? row.partners[0] : row?.partners;
  const partner = partnerRow
    ? ({
        id: partnerRow.id,
        company_name: partnerRow.company_name,
        contact_name: partnerRow.contact_name,
        email: partnerRow.email,
        active: partnerRow.active,
        role: row.role ?? "owner",
        leads_paid: partnerRow.leads_paid !== false
      } satisfies AuthenticatedPartner)
    : null;

  return { user: user, partner, supabase };
}
