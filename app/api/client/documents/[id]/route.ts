import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data: document, error } = await supabase.from("client_documents").select("*").eq("id", id).eq("user_id", user.id).single();
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data: document, error } = await supabase.from("client_documents").select("*").eq("id", id).eq("user_id", user.id).single();
  if (error || !document) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  await supabase.storage.from(document.storage_bucket).remove([document.storage_path]);
  const { error: deleteError } = await supabase.from("client_documents").delete().eq("id", id).eq("user_id", user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
