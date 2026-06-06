import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: document, error } = await supabase.from("client_documents").select("*").eq("id", id).single();
  if (error || !document) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const { data, error: downloadError } = await supabase.storage.from(document.storage_bucket).download(document.storage_path);
  if (downloadError || !data) return NextResponse.json({ error: "Téléchargement impossible." }, { status: 400 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": document.mime_type,
      "Content-Disposition": `attachment; filename="${document.file_name.replace(/"/g, "")}"`
    }
  });
}
