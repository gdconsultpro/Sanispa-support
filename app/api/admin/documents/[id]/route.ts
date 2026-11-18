import { attachmentDisposition } from "@/lib/documents";
import { adminDenied } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export async function GET(_request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const denied = await adminDenied(_request);
    if (denied)
        return denied;
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data: document, error } = await supabase.from("client_documents").select("*").eq("id", id).single();
    if (error || !document)
        return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (document.storage_bucket === "moving-videos") {
    const signed = await supabase.storage.from("moving-videos").createSignedUrl(document.storage_path, 60, { download: document.file_name });
    if (signed.error) return NextResponse.json({error:"Téléchargement impossible."},{status:503});
    return new NextResponse(null,{status:303,headers:{Location:signed.data.signedUrl,"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }
    const { data, error: downloadError } = await supabase.storage.from(document.storage_bucket).download(document.storage_path);
    if (downloadError || !data)
        return NextResponse.json({ error: "Téléchargement impossible." }, { status: 400 });
    return new NextResponse(data, {
        headers: {
            "Content-Type": document.mime_type,
            "Content-Disposition": attachmentDisposition(document.file_name)
        }
    });
}
