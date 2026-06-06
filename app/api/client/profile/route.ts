import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

export async function GET(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const metadata = user.user_metadata ?? {};
  const { data: existing } = await supabase.from("client_profiles").select("*").eq("user_id", user.id).maybeSingle();

  if (existing) return NextResponse.json({ profile: existing });

  const profile = {
    user_id: user.id,
    email: user.email,
    first_name: metadata.firstName || "",
    last_name: metadata.lastName || "",
    phone: metadata.phone || "",
    address: metadata.address || "",
    postal_code: metadata.postalCode || "",
    city: metadata.city || "",
    spa_brand: metadata.spaBrand || "",
    spa_model: metadata.spaModel || "",
    spa_year: metadata.spaYear || ""
  };

  const { data, error } = await supabase.from("client_profiles").insert(profile).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: data });
}

export async function PUT(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const payload = await request.json();
  const row = {
    user_id: user.id,
    email: user.email,
    first_name: payload.first_name || "",
    last_name: payload.last_name || "",
    phone: payload.phone || "",
    address: payload.address || "",
    postal_code: payload.postal_code || "",
    city: payload.city || "",
    spa_brand: payload.spa_brand || "",
    spa_model: payload.spa_model || "",
    spa_year: payload.spa_year || "",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("client_profiles").upsert(row, { onConflict: "user_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: data });
}
