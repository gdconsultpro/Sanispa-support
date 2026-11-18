import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
const bucket = "moving-videos";
const identity = z.object({ draftId: z.string().uuid() });
const prepare = identity.extend({ action: z.literal("prepare"), name: z.string().trim().min(1).max(200), mime: z.enum(["video/mp4", "video/quicktime", "video/webm"]), size: z.number().int().positive().max(30 * 1024 * 1024) }).strict();
const finish = identity.extend({ action: z.enum(["complete", "delete"]), id: z.string().uuid() }).strict();
async function owned(request: Request, id: string, writing = false) {
 const context = await requireUser(request);
 const draft = await context.supabase.from("diagnostic_drafts").select("id,payload,submitted_at").eq("id", id).eq("user_id", context.user.id).maybeSingle();
 if (draft.error) throw draft.error;
 if (!draft.data || draft.data.payload.problemType !== "demenagement") throw new HttpError(404,"Demande de déménagement introuvable.");
 if (writing && draft.data.submitted_at) throw new HttpError(409,"Cette demande a déjà été envoyée. Contactez SANISPA pour la compléter.");
 return context;
}
export async function GET(request: Request) {
 try {
  const { draftId } = identity.parse({ draftId: new URL(request.url).searchParams.get("draftId") });
  const { user, supabase } = await owned(request,draftId);
  const rows = await supabase.from("moving_media_uploads").select("id,file_name,file_size,document_id").eq("draft_id",draftId).eq("user_id",user.id).order("created_at");
  if (rows.error) throw rows.error;
  return NextResponse.json({ videos: rows.data },{headers:{"Cache-Control":"private, no-store"}});
 } catch(e) { return apiError(e); }
}
export async function POST(request: Request) {
 try {
  const p = z.discriminatedUnion("action",[prepare,finish]).parse(await readJson(request,2000));
  const { user,supabase } = await owned(request,p.draftId,p.action !== "complete");
  await rateLimit(supabase,`moving-media:${user.id}`,20,3600);
  if (p.action === "prepare") {
   // Keep at most three reservations per dossier, including in-flight uploads.
   const rows = await supabase.from("moving_media_uploads").select("slot").eq("draft_id",p.draftId);
   if (rows.error) throw rows.error;
   const slot = [0,1,2].find(slot => !rows.data?.some(r => r.slot === slot));
   if (slot === undefined) throw new HttpError(409,"Trois vidéos sont déjà jointes ou en cours d’envoi. Retirez-en une avant de réessayer.");
   const id = randomUUID(), extension = {"video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm"}[p.mime], path = `${user.id}/${p.draftId}/${id}.${extension}`;
   const inserted = await supabase.from("moving_media_uploads").insert({id,draft_id:p.draftId,user_id:user.id,slot,storage_path:path,file_name:p.name,mime_type:p.mime,file_size:p.size});
   if (inserted.error?.code === "23505") throw new HttpError(409,"Un autre envoi vient de démarrer. Réessayez.");
   if (inserted.error) throw inserted.error;
   const signed = await supabase.storage.from(bucket).createSignedUploadUrl(path);
   if (signed.error) { await supabase.from("moving_media_uploads").delete().eq("id",id).eq("user_id",user.id); throw signed.error; }
   return NextResponse.json({ id,path,token:signed.data.token },{headers:{"Cache-Control":"private, no-store"}});
  }
  const row = await supabase.from("moving_media_uploads").select("*").eq("id",p.id).eq("draft_id",p.draftId).eq("user_id",user.id).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) throw new HttpError(404,"Vidéo introuvable.");
  const media = row.data;
  if (p.action === "delete") {
   const removed = await supabase.storage.from(bucket).remove([media.storage_path]); if(removed.error) throw removed.error;
   if(media.document_id) { const removedDoc=await supabase.from("client_documents").delete().eq("id",media.document_id).eq("user_id",user.id); if(removedDoc.error) throw removedDoc.error; }
   const removedRow=await supabase.from("moving_media_uploads").delete().eq("id",media.id).eq("user_id",user.id); if(removedRow.error) throw removedRow.error;
   return NextResponse.json({saved:true});
  }
  if(media.document_id) return NextResponse.json({saved:true});
  const info = await supabase.storage.from(bucket).info(media.storage_path);
  if(info.error || info.data.size !== media.file_size || info.data.contentType !== media.mime_type) throw new HttpError(400,"L’envoi de la vidéo est incomplet ou son format est incorrect. Retirez-la et réessayez.");
  // Check the container signature without downloading a large file through the API.
  const signed = await supabase.storage.from(bucket).createSignedUrl(media.storage_path,30);
  if(signed.error) throw signed.error;
  const response = await fetch(signed.data.signedUrl,{headers:{Range:"bytes=0-63"},cache:"no-store"});
  const reader=response.body?.getReader();const chunk=await reader?.read();await reader?.cancel();
  const header=Buffer.from(chunk?.value || []);
  const valid=response.ok && (media.mime_type === "video/webm" ? header.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) : header.toString("ascii",4,8) === "ftyp");
  if(!valid) throw new HttpError(400,"Ce fichier n’est pas une vidéo compatible. Exportez-le en MP4 et réessayez.");
  const complete=await supabase.rpc("complete_moving_media_upload",{p_id:media.id,p_user:user.id});if(complete.error) throw complete.error;
  return NextResponse.json({saved:true});
 } catch(e) { return apiError(e); }
}
