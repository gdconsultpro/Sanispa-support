import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

export async function GET(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user?.email) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data: customers } = await supabase.from("customers").select("id").eq("email", user.email);
  const customerIds = (customers ?? []).map((customer) => customer.id);

  if (!customerIds.length) {
    return NextResponse.json({ documents: [] });
  }

  const { data, error } = await supabase
    .from("diagnostics")
    .select(`
      id,
      created_at,
      status,
      problem_type,
      choice,
      payment_status,
      customers (
        spa_brand,
        spa_model
      )
    `)
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const documents = (data ?? []).map((diagnostic) => {
    const customer = Array.isArray(diagnostic.customers) ? diagnostic.customers[0] : diagnostic.customers;
    return {
      id: diagnostic.id,
      name: `Résumé de demande n°${diagnostic.id.slice(0, 8).toUpperCase()}`,
      date: diagnostic.created_at,
      problemType: diagnostic.problem_type,
      status: diagnostic.status,
      spa: [customer?.spa_brand, customer?.spa_model].filter(Boolean).join(" ") || "Spa non renseigné"
    };
  });

  return NextResponse.json({ documents });
}
