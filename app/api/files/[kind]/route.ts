import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { adminToken } from "@/lib/admin-auth";
import { verifySessionToken } from "@/lib/session-auth";
import { apiError, HttpError } from "@/lib/http";
import { attachmentDisposition } from "@/lib/documents";
import { hasPartnerAppointment } from "@/lib/partner-auth";
import { externalReportType } from "@/lib/client-external-report";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const token = adminToken(request.headers);
    if (!token) throw new HttpError(401, "Connexion requise.");
    const supabase = getSupabaseAdmin(),
      session = await verifySessionToken(token, supabase);
    if (!session)
      throw new HttpError(401, "Session expirée. Reconnectez-vous.");
    const { kind } = await params;
    const search = new URL(request.url).searchParams;
    let diagnosticId: string | null,
      owner: string | null = null,
      bucket: string,
      path: string,
      name: string;
    if (kind === "preview") {
      const diagnostic = search.get("diagnostic"),
        selected = search.get("path");
      if (!diagnostic || !selected)
        throw new HttpError(404, "Fichier introuvable.");
      const { data: offer, error } = await supabase
        .from("diagnostics")
        .select(
          "id,request_type,status,archived_at,partner_released_at,partner_kept_at,matched_partner_ids,preview_photo_paths",
        )
        .eq("id", diagnostic)
        .maybeSingle();
      if (
        error ||
        !offer ||
        offer.request_type !== "TECHNICAL_REQUEST" ||
        offer.archived_at ||
        offer.partner_kept_at ||
        !offer.partner_released_at ||
        !offer.preview_photo_paths?.includes(selected) ||
        offer.matched_partner_ids?.length !== 1
      )
        throw new HttpError(404, "Fichier introuvable.");
      const { data: membership, error: memberError } = await supabase
        .from("partner_users")
        .select("partner_id,role,technician_id,partners!inner(active,verification_status)")
        .eq("user_id", session.user.id)
        .eq("partner_id", offer.matched_partner_ids[0])
        .eq("role", "owner")
        .eq("active", true)
        .eq("partners.active", true)
        .neq("partners.verification_status", "pending")
        .maybeSingle();
      if (
        memberError ||
        !membership ||
        session.user.app_metadata?.partner_password_change_required === true
      )
        throw new HttpError(404, "Fichier introuvable.");
      const { data: photo, error: photoError } = await supabase
        .from("diagnostic_photos")
        .select("storage_path")
        .eq("diagnostic_id", offer.id)
        .eq("storage_path", selected)
        .maybeSingle();
      if (photoError || !photo)
        throw new HttpError(404, "Fichier introuvable.");
      const { data: file, error: downloadError } = await supabase.storage
        .from("diagnostic-photos")
        .download(photo.storage_path);
      if (downloadError || !file)
        throw new HttpError(503, "Téléchargement impossible.");
      return new NextResponse(file, {
        headers: {
          "Content-Type": ["image/jpeg", "image/png", "image/webp"].includes(
            file.type,
          )
            ? file.type
            : "application/octet-stream",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (kind === "photo") {
      const selected = search.get("path");
      if (!selected || selected.length > 1000)
        throw new HttpError(404, "Fichier introuvable.");
      const { data, error } = await supabase
        .from("diagnostic_photos")
        .select("diagnostic_id,storage_path,photo_type")
        .eq("storage_path", selected)
        .maybeSingle();
      if (error || !data) throw new HttpError(404, "Fichier introuvable.");
      diagnosticId = data.diagnostic_id;
      bucket = "diagnostic-photos";
      path = data.storage_path;
      name = data.photo_type;
    } else if (kind === "document") {
      const selected = search.get("id");
      if (!selected?.match(/^[a-f0-9-]{36}$/i))
        throw new HttpError(404, "Fichier introuvable.");
      const { data, error } = await supabase
        .from("client_documents")
        .select("diagnostic_id,user_id,storage_bucket,storage_path,file_name,document_type")
        .eq("id", selected)
        .maybeSingle();
      if (error || !data) throw new HttpError(404, "Fichier introuvable.");
      if (data.document_type === externalReportType && data.user_id !== session.user.id)
        throw new HttpError(404, "Fichier introuvable.");
      diagnosticId = data.diagnostic_id;
      owner = data.user_id;
      bucket = data.storage_bucket;
      path = data.storage_path;
      name = data.file_name;
    } else throw new HttpError(404, "Fichier introuvable.");
    let assignedPartner: string | null = null;
    if (diagnosticId) {
      const { data, error } = await supabase
        .from("diagnostics")
        .select("user_id,assigned_partner_id,archived_at")
        .eq("id", diagnosticId)
        .maybeSingle();
      if (error || !data) throw new HttpError(404, "Fichier introuvable.");
      if (kind === "photo") owner = data.user_id;
      assignedPartner = data.archived_at ? null : data.assigned_partner_id;
    }
    let allowed =
      owner === session.user.id ||
      (session.isAdmin && session.claims.aal === "aal2" && session.mfaVerified);
    if (!allowed && assignedPartner) {
      const { data, error } = await supabase
        .from("partner_users")
        .select("partner_id,role,technician_id,partners!inner(active,verification_status)")
        .eq("user_id", session.user.id)
        .eq("partner_id", assignedPartner)
        .eq("active", true)
        .eq("partners.active", true)
        .neq("partners.verification_status", "pending")
        .maybeSingle();
      if (error) throw error;
      if (data && session.user.app_metadata?.partner_password_change_required !== true) {
        allowed = data.role === "owner" || (kind === "photo" && Boolean(diagnosticId) &&
          (await hasPartnerAppointment(supabase, assignedPartner, diagnosticId!, data.technician_id)));
      }
    }
    if (!allowed) throw new HttpError(404, "Fichier introuvable.");
    if (bucket === "moving-videos") {
      const signed = await supabase.storage.from(bucket).createSignedUrl(path,60,{download:name});
      if(signed.error) throw new HttpError(503,"Téléchargement impossible.");
      return new NextResponse(null,{status:303,headers:{Location:signed.data.signedUrl,"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
    }
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data)
      throw new HttpError(503, "Téléchargement impossible. Réessayez.");
    const isImage =
      kind === "photo" &&
      ["image/jpeg", "image/png", "image/webp"].includes(data.type);
    return new NextResponse(data, {
      headers: {
        "Content-Type": isImage ? data.type : "application/octet-stream",
        "Content-Disposition": isImage ? "inline" : attachmentDisposition(name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
