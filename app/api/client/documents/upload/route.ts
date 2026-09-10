import { NextResponse } from "next/server";
import { ownsDiagnostic } from "@/lib/client-auth";
import { getAuthenticatedUser } from "@/lib/client-auth";
import { apiError, readBytes } from "@/lib/http";
import { validateDocument } from "@/lib/documents";
import { rateLimit } from "@/lib/client-auth";
import { randomUUID } from "node:crypto";
const maxSize = 3 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user)
        return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    await rateLimit(supabase, `document:${user.id}`, 20, 3600);
    const bytes = await readBytes(request, maxSize + 100000);
    const formData = await new Response(bytes, {headers: {'Content-Type': request.headers.get('content-type') || ''}}).formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({error:"Fichier manquant."},{status:400});
    const buffer = Buffer.from(await file.arrayBuffer());
    validateDocument(file.name, file.type, buffer);
    const documentType = String(formData.get("documentType") || "Autre document").slice(0,100);
    const spaId = String(formData.get("spaId") || "") || null;
    const diagnosticId = String(formData.get("diagnosticId") || "") || null;
    if (spaId) {
        const { data, error } = await supabase.from("customer_spas").select("id").eq("id", spaId).eq("user_id", user.id).maybeSingle();
        if (error || !data)
            return NextResponse.json({ error: "Spa introuvable." }, { status: 403 });
    }
    if (diagnosticId && !await ownsDiagnostic(supabase, diagnosticId, user.id))
        return NextResponse.json({ error: "Dossier introuvable." }, { status: 403 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = `${user.id}/${randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("client-documents").upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
    });
    if (uploadError)
        return NextResponse.json({ error: "Téléversement impossible. Réessayez." }, { status: 503 });
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
    if (error) {
        await supabase.storage.from("client-documents").remove([storagePath]);
        return NextResponse.json({ error: "Enregistrement impossible." }, { status: 400 });
    }
    return NextResponse.json({ document: data });
  } catch (error) { return apiError(error); }
}
