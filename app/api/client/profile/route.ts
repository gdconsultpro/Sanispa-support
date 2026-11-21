import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/client-auth";

const profileText = z.string().trim().max(500).nullish();
const profileInput = z.object({
  first_name: profileText,
  last_name: profileText,
  phone: profileText,
  address: profileText,
  postal_code: profileText,
  city: profileText,
  spa_brand: profileText,
  spa_model: profileText,
  spa_year: profileText,
}).refine(({ first_name, last_name }) => [first_name, last_name].filter(Boolean).join(" ").length <= 500);

export async function GET(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user?.email) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const metadata = user.user_metadata ?? {};
  const { data: existing, error } = await supabase.from("client_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Profil indisponible." }, { status: 503 });

  if (existing) return NextResponse.json({ profile: { ...existing, email: user.email } });

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

  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user?.email) return NextResponse.json({ error: "Reconnectez-vous pour enregistrer vos coordonnées." }, { status: 401 });

  const input = profileInput.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Vérifiez les informations saisies." }, { status: 400 });
  }
  const payload = input.data;
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
  if (error) return NextResponse.json({ error: "Impossible d’enregistrer vos coordonnées. Réessayez." }, { status: 503 });
  return NextResponse.json({ profile: data });
}
