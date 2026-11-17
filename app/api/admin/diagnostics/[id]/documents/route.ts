import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, HttpError, readBytes } from "@/lib/http";
import { validateDocument } from "@/lib/documents";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await administrator(request.headers);
    requireSameOrigin(request);
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { data: dossier, error } = await supabase
      .from("diagnostics")
      .select("user_id,spa_id")
      .eq("id", id)
      .single();
    if (error || !dossier?.user_id)
      throw new HttpError(
        409,
        "Le dossier doit être rattaché à un compte client avant le dépôt.",
      );
    const bytes = await readBytes(request, 3 * 1024 * 1024 + 100000);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new HttpError(400, "Sélectionnez un document.");
    const type = z
      .enum([
        "Facture d’intervention",
        "Devis",
        "Compte rendu d’intervention",
        "Autre document SANISPA",
      ])
      .parse(form.get("documentType"));
    const buffer = Buffer.from(await file.arrayBuffer());
    validateDocument(file.name, file.type, buffer);
    const path = `${dossier.user_id}/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const uploaded = await supabase.storage
      .from("client-documents")
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const saved = await supabase
      .from("client_documents")
      .insert({
        user_id: dossier.user_id,
        diagnostic_id: id,
        spa_id: dossier.spa_id,
        document_type: type,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        storage_bucket: "client-documents",
        storage_path: path,
        issued_by: "sanispa",
      })
      .select("id")
      .single();
    if (saved.error) {
      await supabase.storage.from("client-documents").remove([path]);
      throw saved.error;
    }
    return NextResponse.json({ saved: true, id: saved.data.id });
  } catch (error) {
    return apiError(error);
  }
}
