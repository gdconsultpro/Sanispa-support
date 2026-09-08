import { NextResponse } from "next/server";
import { ownsDiagnostic } from "@/lib/client-auth";
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
const maxSize = 3 * 1024 * 1024;
export async function POST(request: Request) {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user)
        return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    if(Number(request.headers.get("content-length"))>maxSize+100000)return NextResponse.json({error:"Le fichier dépasse 3 Mo."},{status:413});
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }
    if (file.size > maxSize) {
        return NextResponse.json({ error: "Le fichier dépasse 3 Mo." }, { status: 400 });
    }
    if (!allowedMimeTypes.has(file.type) || blockedExtensions.test(file.name)) {
        return NextResponse.json({ error: "Format de fichier non autorisé." }, { status: 400 });
    }
    const documentType = String(formData.get("documentType") || "Autre document");
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
    const storagePath = `${user.id}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from("client-documents").upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
    });
    if (uploadError)
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
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
}
