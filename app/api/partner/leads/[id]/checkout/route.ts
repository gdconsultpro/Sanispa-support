import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { acquirePartnerLead } from "@/lib/partner-acquisition";
import { apiError } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await params).id);
    const { user, partner, supabase } = await getAuthenticatedPartner(request);
    if (!user) return NextResponse.json({ error: "Connexion partenaire requise." }, { status: 401 });
    if (!partner) return NextResponse.json({ error: "Aucun accès partenaire actif n’est associé à ce compte." }, { status: 403 });
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    // The browser cannot choose the billing mode, price, author or beneficiary.
    const result = await acquirePartnerLead({ supabase, partner, userId: user.id, diagnosticId: id, origin });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
