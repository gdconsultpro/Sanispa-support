import { getSupabaseAdmin } from "@/lib/supabase";

export type AuthenticatedPartner = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string;
  active: boolean;
  role: string;
};

export async function getAuthenticatedPartner(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const supabase = getSupabaseAdmin();

  if (!token) {
    return { user: null, partner: null, supabase };
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, partner: null, supabase };
  }

  const { data: link, error: partnerError } = await supabase
    .from("partner_users")
    .select("role, active, partners!inner(id, company_name, contact_name, email, active)")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .eq("partners.active", true)
    .maybeSingle();

  if (partnerError) {
    console.error("[partner-auth] Partner lookup failed", {
      userId: data.user.id,
      error: partnerError.message
    });
    return { user: data.user, partner: null, supabase };
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
        role: row.role ?? "owner"
      } satisfies AuthenticatedPartner)
    : null;

  return { user: data.user, partner, supabase };
}
