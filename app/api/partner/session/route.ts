import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { apiError } from "@/lib/http";

export async function GET(request: Request) {
  try {
  const { user, partner, passwordChangeRequired } = await getAuthenticatedPartner(request, { allowPasswordChange: true });

  if (!user) {
    return NextResponse.json({ error: "Connexion partenaire requise." }, { status: 401 });
  }

  if (!partner) {
    return NextResponse.json({ error: "Aucun accès partenaire actif n'est associé à ce compte." }, { status: 403 });
  }

  return NextResponse.json({ partner, passwordChangeRequired }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
