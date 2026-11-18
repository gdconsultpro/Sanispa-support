"use client";
import { useCallback, useEffect, useState } from "react";
import { clientRequest } from "@/lib/client-browser-api";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "./Button";
type Video = {id:string;file_name:string;file_size:number;document_id:string|null};
export function MovingMedia({ draftId, readOnly = false, onBusyChange }: {draftId:string;readOnly?:boolean;onBusyChange?:(busy:boolean)=>void}) {
 const [videos,setVideos]=useState<Video[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 const request=useCallback((payload:object)=>clientRequest("/api/client/moving-media",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draftId,...payload})}),[draftId]);
 const load=useCallback(async(signal?:AbortSignal)=>{const r=await clientRequest(`/api/client/moving-media?draftId=${draftId}`,{signal});if(!signal?.aborted)setVideos(r.videos);},[draftId]);
 useEffect(()=>{const c=new AbortController();void load(c.signal).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[load]);
 async function upload(file:File) {
  if(busy)return;setBusy(true);setError("");setMessage("");let reservation:string|undefined;
  try {
   if(!["video/mp4","video/quicktime","video/webm"].includes(file.type)||file.size>30*1024*1024||!file.size)throw new Error("Choisissez une vidéo MP4, MOV ou WebM de 30 Mo maximum.");
   const signed=await request({action:"prepare",name:file.name,mime:file.type,size:file.size});reservation=signed.id;
   const sent=await getSupabaseBrowser().storage.from("moving-videos").uploadToSignedUrl(signed.path,signed.token,file,{contentType:file.type});
   if(sent.error)throw new Error("L’envoi n’a pas abouti. Vérifiez votre connexion et réessayez.");
   await request({action:"complete",id:signed.id});reservation=undefined;await load();setMessage("Votre vidéo est jointe au dossier privé et sera transmise à SANISPA avec votre demande.");
  }catch(e){if(reservation)await request({action:"delete",id:reservation}).catch(()=>{});setError(e instanceof Error?e.message:"Envoi impossible.");}
  finally{setBusy(false);}
 }
 async function remove(id:string){setBusy(true);setError("");try{await request({action:"delete",id});await load();}catch(e){setError(e instanceof Error?e.message:"Suppression impossible.");}finally{setBusy(false);}}
 async function open(id:string){try{const {data}=await getSupabaseBrowser().auth.getSession();const r=await fetch(`/api/client/documents/${id}`,{headers:{Authorization:`Bearer ${data.session?.access_token}`}});if(!r.ok)throw new Error();const url=URL.createObjectURL(await r.blob());const a=document.createElement("a");a.href=url;a.download=videos.find(v=>v.document_id===id)?.file_name||"video";a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{setError("Téléchargement impossible. Réessayez.");}}
 return <section className="mb-5 min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">Vidéos des accès et du spa</h2><p className="mt-2 text-sm leading-6">Facultatif : jusqu’à 3 vidéos, 30 Mo chacune, aux formats MP4, MOV ou WebM. Filmez le trajet aux deux adresses, les obstacles et les passages étroits. Attendez la confirmation d’envoi avant de poursuivre.</p>{!readOnly ? <label className="mt-4 block font-bold">Ajouter une vidéo au dossier<input type="file" accept="video/mp4,video/quicktime,video/webm" className="focus-ring mt-2 block w-full min-w-0 rounded-xl border p-3 text-sm" disabled={busy||videos.length>=3} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file);}} /></label> : null}{busy?<p role="status" className="mt-3">Envoi ou mise à jour en cours…</p>:null}{message?<p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>:null}{error?<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>:null}<ul className="mt-4 space-y-3">{videos.map(v=><li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sanispa-ice p-3"><span className="min-w-0 break-all text-sm">{v.file_name} · {(v.file_size/1024/1024).toLocaleString("fr-FR",{maximumFractionDigits:1})} Mo</span><div className="flex flex-wrap gap-3">{v.document_id ? <Button variant="secondary" disabled={busy} onClick={()=>void open(v.document_id!)}>Télécharger</Button> : <span className="text-sm">Envoi non terminé — retirez cette vidéo pour réessayer</span>}{!readOnly ? <button type="button" className="underline" disabled={busy} onClick={()=>void remove(v.id)}>Retirer cette vidéo</button> : null}</div></li>)}</ul>{readOnly && !videos.length ? <p className="mt-3 text-sm">Aucune vidéo jointe. Vous pouvez revenir aux photos et vidéos pour compléter votre dossier.</p> : null}</section>;
}
