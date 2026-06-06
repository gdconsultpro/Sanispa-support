import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

export async function GET(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user?.email) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data: customers, error: customerError } = await supabase.from("customers").select("id").eq("email", user.email);
  if (customerError) return NextResponse.json({ error: customerError.message }, { status: 400 });

  const customerIds = (customers ?? []).map((customer) => customer.id);
  if (!customerIds.length) return NextResponse.json({ diagnostics: [] });

  const { data, error } = await supabase
    .from("diagnostics")
    .select("id, created_at, status, problem_type, choice, payment_status")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ diagnostics: data ?? [] });
}
