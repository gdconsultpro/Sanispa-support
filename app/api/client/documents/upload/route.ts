import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const blockedExtensions = /\.(exe|app|bat|cmd|com|scr|js|sh|php|jar|msi)$/i;
const maxSize = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }

  if (file.size > maxSize) {
    return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 400 });
  }

  if (!allowedMimeTypes.has(file.type) || blockedExtensions.test(file.name)) {
    return NextResponse.json({ error: "Format de fichier non autorisé." }, { status: 400 });
  }

  const documentType = String(formData.get("documentType") || "Autre document");
  const spaId = String(formData.get("spaId") || "") || null;
  const diagnosticId = String(formData.get("diagnosticId") || "") || null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `${user.id}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from("client-documents").upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false
  });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data, error } = await supabase.from("client_documents").insert({
    user_id: user.id,
    diagnostic_id: diagnosticId,
    spa_id: spaId,
    document_type: documentType,
    file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
    storage_bucket: "client-documents",
    storage_path: storagePath
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ document: data });
}
