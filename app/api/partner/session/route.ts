import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";

export async function GET(request: Request) {
  const { user, partner } = await getAuthenticatedPartner(request);

  if (!user) {
    return NextResponse.json({ error: "Connexion partenaire requise." }, { status: 401 });
  }

  if (!partner) {
    return NextResponse.json({ error: "Aucun accès partenaire actif n'est associé à ce compte." }, { status: 403 });
  }

  return NextResponse.json({ partner });
}
