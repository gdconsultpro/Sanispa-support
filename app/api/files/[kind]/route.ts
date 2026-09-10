import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { adminToken } from "@/lib/admin-auth";
import { verifySessionToken } from "@/lib/session-auth";
import { apiError, HttpError } from "@/lib/http";
import { attachmentDisposition } from "@/lib/documents";

export async function GET(request: Request, {params}: {params:Promise<{kind:string}>}) {
  try {
    const token = adminToken(request.headers);
    if (!token) throw new HttpError(401,"Connexion requise.");
    const supabase = getSupabaseAdmin(), session = await verifySessionToken(token,supabase);
    if (!session) throw new HttpError(401,"Session expirée. Reconnectez-vous.");
    const {kind} = await params;
    const search = new URL(request.url).searchParams;
    let diagnosticId: string | null, owner: string | null = null, bucket:string, path:string, name:string;
    if (kind === 'photo') {
      const selected = search.get('path');
      if (!selected || selected.length>1000) throw new HttpError(404,"Fichier introuvable.");
      const {data,error} = await supabase.from('diagnostic_photos').select('diagnostic_id,storage_path,photo_type').eq('storage_path',selected).maybeSingle();
      if (error || !data) throw new HttpError(404,"Fichier introuvable.");
      diagnosticId=data.diagnostic_id;bucket='diagnostic-photos';path=data.storage_path;name=data.photo_type;
    } else if(kind === 'document') {
      const selected = search.get('id');
      if (!selected?.match(/^[a-f0-9-]{36}$/i)) throw new HttpError(404,"Fichier introuvable.");
      const {data,error} = await supabase.from('client_documents').select('diagnostic_id,user_id,storage_bucket,storage_path,file_name').eq('id',selected).maybeSingle();
      if (error || !data) throw new HttpError(404,"Fichier introuvable.");
      diagnosticId=data.diagnostic_id;owner=data.user_id;bucket=data.storage_bucket;path=data.storage_path;name=data.file_name;
    } else throw new HttpError(404,"Fichier introuvable.");
    let assignedPartner: string | null = null;
    if (diagnosticId) {
      const {data,error} = await supabase.from('diagnostics').select('user_id,assigned_partner_id').eq('id',diagnosticId).maybeSingle();
      if(error || !data) throw new HttpError(404,"Fichier introuvable.");
      if(kind==='photo') owner=data.user_id;
      assignedPartner=data.assigned_partner_id;
    }
    let allowed=owner===session.user.id || (session.isAdmin && session.claims.aal==='aal2' && session.mfaVerified);
    if(!allowed && assignedPartner) {
      const {data,error}=await supabase.from('partner_users').select('partner_id,partners!inner(active)').eq('user_id',session.user.id).eq('partner_id',assignedPartner).eq('active',true).eq('partners.active',true).maybeSingle();
      if(error) throw error;
      allowed=Boolean(data);
    }
    if(!allowed) throw new HttpError(404,"Fichier introuvable.");
    const {data,error}=await supabase.storage.from(bucket).download(path);
    if(error || !data) throw new HttpError(503,"Téléchargement impossible. Réessayez.");
    const isImage=kind==='photo' && ['image/jpeg','image/png','image/webp'].includes(data.type);
    return new NextResponse(data,{headers:{'Content-Type':isImage?data.type:'application/octet-stream','Content-Disposition':isImage?'inline':attachmentDisposition(name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch(error){return apiError(error);}
}
