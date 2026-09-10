"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { authHeaders } from "@/lib/storage";
export function PrivateFile({url,name,photo=false}:{url:string;name:string;photo?:boolean}) {
  const [src,setSrc]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!photo) return;
    let disposed=false, objectUrl="";
    authHeaders().then(headers=>fetch(url,{headers})).then(async r=>{if(!r.ok)throw Error();return r.blob();}).then(blob=>{
      if(disposed)return;
      objectUrl=URL.createObjectURL(blob);setSrc(objectUrl);
    }).catch(()=>{if(!disposed)setError("Photo indisponible. Reconnectez-vous puis réessayez.");});
    return()=>{disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[url,photo]);
  async function download(){
    setBusy(true);setError("");
    try{
      const r=await fetch(url,{headers:await authHeaders()});if(!r.ok)throw Error();
      const objectUrl=URL.createObjectURL(await r.blob()), link=document.createElement('a');
      link.href=objectUrl;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    }catch{setError("Téléchargement impossible. Reconnectez-vous puis réessayez.");}
    finally{setBusy(false);}
  }
  return <div>{photo && src && <Image unoptimized src={src} width={400} height={200} alt={name} className="h-36 w-full rounded-md object-cover"/>}<button type="button" onClick={download} disabled={busy} className="focus-ring mt-2 rounded-md border border-sanispa-line px-3 py-2 text-sm font-bold">{busy?'Téléchargement…':photo?name:'Télécharger'}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
