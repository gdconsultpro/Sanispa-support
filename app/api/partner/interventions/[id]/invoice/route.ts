import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePartnerOwner } from "@/lib/partner-auth";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readBytes } from "@/lib/http";
import { validateDocument } from "@/lib/documents";
import { interventionCase, interventionError } from "@/lib/interventions";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, partner, supabase } = await requirePartnerOwner(request);
    const { id } = await params;
    const dossier = await interventionCase(supabase, id, { partnerId: partner.id });
    if (!dossier.user_id) throw new HttpError(409, "Le dossier doit être rattaché à un compte client par SANISPA.");
    await rateLimit(supabase, `partner-invoice:${partner.id}`, 10);
    const bytes = await readBytes(request, 3 * 1024 * 1024 + 100000);
    const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") throw new HttpError(400, "Choisissez votre facture au format PDF (3 Mo maximum).");
    const buffer = Buffer.from(await file.arrayBuffer());
    validateDocument(file.name, file.type, buffer);
    const documentId = randomUUID(), path = `${dossier.user_id}/${documentId}.pdf`;
    const uploaded = await supabase.storage.from("client-documents").upload(path, buffer, { contentType: "application/pdf", upsert: false });
    if (uploaded.error) throw uploaded.error;
    const saved = await supabase.rpc("register_partner_invoice", { p_id: documentId, p_diagnostic: id, p_partner: partner.id, p_actor: user.id, p_name: file.name, p_size: file.size, p_path: path });
    if (saved.error) {
      await supabase.storage.from("client-documents").remove([path]);
      throw interventionError(saved.error);
    }
    return NextResponse.json({ saved: true, id: documentId });
  } catch (e) { return apiError(e); }
}
