import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

export async function GET(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data, error } = await supabase.from("customer_spas").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ spas: data ?? [] });
}

export async function POST(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const payload = await request.json();
  const { data, error } = await supabase.from("customer_spas").insert({
    user_id: user.id,
    brand: payload.brand || "Non renseignée",
    model: payload.model || null,
    spa_year: payload.spa_year || null,
    installation_type: payload.installation_type || null
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ spa: data });
}
