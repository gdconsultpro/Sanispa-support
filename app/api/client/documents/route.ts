import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

export async function GET(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user?.email) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data: customers } = await supabase.from("customers").select("id").eq("email", user.email);
  const customerIds = (customers ?? []).map((customer) => customer.id);

  const summaries = [];
  if (customerIds.length) {
    const { data } = await supabase
      .from("diagnostics")
      .select(`
        id,
        created_at,
        status,
        problem_type,
        customers (
          spa_brand,
          spa_model
        )
      `)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    summaries.push(...(data ?? []).map((diagnostic) => {
      const customer = Array.isArray(diagnostic.customers) ? diagnostic.customers[0] : diagnostic.customers;
      return {
        id: diagnostic.id,
        kind: "summary",
        name: `Résumé de demande n°${diagnostic.id.slice(0, 8).toUpperCase()}`,
        date: diagnostic.created_at,
        type: "Résumé de demande",
        problemType: diagnostic.problem_type,
        status: diagnostic.status,
        spa: [customer?.spa_brand, customer?.spa_model].filter(Boolean).join(" ") || "Spa non renseigné"
      };
    }));
  }

  const { data: uploaded, error } = await supabase
    .from("client_documents")
    .select("id, created_at, document_type, file_name, spa_id, diagnostic_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const documents = [
    ...summaries,
    ...(uploaded ?? []).map((document) => ({
      id: document.id,
      kind: "uploaded",
      name: document.file_name,
      date: document.created_at,
      type: document.document_type,
      problemType: document.document_type,
      status: "Document ajouté",
      spa: document.spa_id ? `Spa lié` : "Non lié",
      diagnosticId: document.diagnostic_id
    }))
  ];

  return NextResponse.json({ documents });
}
