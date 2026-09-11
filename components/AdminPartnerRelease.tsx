"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type Release = { releasedAt: string | null; assigned: boolean; selected: string[]; partners: {id:string;company_name:string}[] };
export function AdminPartnerRelease({diagnosticId}:{diagnosticId:string}) {
  const router=useRouter();
  const [data,setData]=useState<Release|null>(null);
  const [selected,setSelected]=useState("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const load=useCallback(async()=>{
    const response=await fetch(`/api/admin/diagnostics/${diagnosticId}/partner-release`,{cache:"no-store",signal:AbortSignal.timeout(20000)});
    const body=await response.json();
    if(!response.ok) throw new Error(body.error || "Vérification de la diffusion impossible.");
    setData(body); if(body.releasedAt) setSelected(body.selected?.[0] || "");
  },[diagnosticId]);
  useEffect(()=>{void load().catch(()=>setMessage("Impossible de charger la diffusion. Fermez puis rouvrez le dossier pour réessayer."));},[load]);
  async function release(event:React.FormEvent) {
    event.preventDefault(); if(saving) return;
    setSaving(true); setMessage("");
    try {
      const response=await fetch(`/api/admin/diagnostics/${diagnosticId}/partner-release`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({partnerId:selected}),signal:AbortSignal.timeout(25000)});
      const body=await response.json();
      if(!response.ok || !body.released) throw new Error(body.error || "La diffusion n’a pas pu être confirmée.");
      setMessage(body.notificationPending ? "Diffusion validée. L’e-mail de notification reste en attente d’envoi." : body.alreadyReleased ? "Cette diffusion avait déjà été validée. Aucun nouvel e-mail envoyé." : "Diffusion validée et notification envoyée au partenaire sélectionné.");
      await load(); router.refresh();
    } catch(error) {setMessage(error instanceof Error && error.name==="Error" ? error.message : "Réponse interrompue. Actualisez le dossier pour vérifier la diffusion avant de réessayer.");}
    finally{setSaving(false);}
  }
  return <section className="rounded-lg border border-sanispa-line p-4">
    <h3 className="font-bold text-sanispa-navy">Validation de l’intervention et choix du partenaire</h3>
    {data?.assigned ? <p className="mt-2 text-sm">Ce dossier est déjà attribué. Son attribution est conservée.</p> : data?.releasedAt ? <p className="mt-2 text-sm">Diffusion validée le {new Date(data.releasedAt).toLocaleString("fr-FR")} · {data.partners.find(p=>p.id===selected)?.company_name || "Partenaire sélectionné"}.</p> : <>
      <p className="mt-2 text-sm text-sanispa-steel">La validation SANISPA est obligatoire avant toute diffusion. Seul le partenaire choisi pourra consulter l’aperçu ; les coordonnées resteront masquées jusqu’à son attribution exclusive.</p>
      {data ? <form onSubmit={release} className="mt-4 grid gap-3">
        <label className="grid gap-2 text-sm font-bold">Partenaire couvrant le département<select required value={selected} onChange={e=>setSelected(e.target.value)} className="focus-ring min-h-12 rounded-md border p-2 font-normal"><option value="">Sélectionner un partenaire</option>{data.partners.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}</select></label>
        {!data.partners.length ? <p className="text-sm">Aucun partenaire actif ne couvre ce département. Complétez sa couverture dans Administration → Partenaires.</p> : null}
        <button disabled={saving || !selected} type="submit" className="focus-ring rounded-md bg-sanispa-navy px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?"Validation en cours…":"Valider et notifier ce partenaire"}</button>
      </form> : null}
    </>}
    {message?<p role="status" className="mt-3 text-sm">{message}</p>:null}
  </section>;
}
