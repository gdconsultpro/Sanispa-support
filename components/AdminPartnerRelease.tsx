"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { partnerDispatchLabels, partnerNotificationLabel, type PartnerDispatchDecision, type PartnerNotificationState } from "@/lib/partner-release";
type Release={decision:PartnerDispatchDecision|null;decidedAt:string|null;selectedPartner:string|null;canKeep:boolean;canRelease:boolean;notification:PartnerNotificationState|null;partners:{id:string;company_name:string;leads_paid:boolean}[]};
export function AdminPartnerRelease({diagnosticId}:{diagnosticId:string}) {
  const router=useRouter();
  const [data,setData]=useState<Release|null>(null);
  const [selected,setSelected]=useState("");
  const [intent,setIntent]=useState<"keep"|"release"|null>(null);
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const response=await fetch(`/api/admin/diagnostics/${diagnosticId}/partner-release`,{cache:"no-store",signal:AbortSignal.timeout(20000)});
      const body=await response.json();
      if(!response.ok) throw new Error(body.error || "Vérification de la diffusion impossible.");
      setData(body);
    } finally {setLoading(false);}
  },[diagnosticId]);
  useEffect(()=>{void load().catch(()=>setMessage("Impossible de charger la décision. Utilisez « Actualiser l’état » pour réessayer."));},[load]);
  async function decide(event:React.FormEvent) {
    event.preventDefault(); if(saving || !intent) return;
    setSaving(true);setMessage("");
    try {
      const response=await fetch(`/api/admin/diagnostics/${diagnosticId}/partner-release`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(intent==="keep"?{action:"keep"}:{action:"release",partnerId:selected}),signal:AbortSignal.timeout(25000)});
      const body=await response.json();
      if(!response.ok || !body.saved) throw new Error(body.error || "La décision n’a pas pu être confirmée. Actualisez son état avant de réessayer.");
      setData(body);setIntent(null);setMessage(body.decision==="internal"?"Décision enregistrée : ce dossier reste chez SANISPA.":"Diffusion autorisée pour le partenaire sélectionné. Les coordonnées restent protégées jusqu’à l’attribution exclusive.");
      router.refresh();
    } catch(error) {setMessage(error instanceof Error && error.name==="Error" ? error.message : "Réponse interrompue. Actualisez l’état pour vérifier la décision avant de réessayer.");}
    finally{setSaving(false);}
  }
  return <section className="min-w-0 rounded-lg border border-sanispa-line p-4">
    <h3 className="font-bold text-sanispa-navy">Décision de diffusion de l’intervention</h3>
    <p className="mt-2 text-sm text-sanispa-steel">Cette décision est distincte du statut de traitement et de l’attribution du dossier.</p>
    {loading && !data?<p role="status" className="mt-3 text-sm">Chargement de la décision…</p>:null}
    {data ? <>
      <p className="mt-3 font-bold text-sanispa-navy">{data.decision?partnerDispatchLabels[data.decision]:"Parcours non concerné"}</p>
      {data.decidedAt?<p className="mt-1 text-sm">Décision du {new Date(data.decidedAt).toLocaleString("fr-FR",{timeZone:"Europe/Paris"})}{data.selectedPartner?` · ${data.selectedPartner}`:""}.</p>:null}
      {data.decision==="pending"?<p className="mt-2 text-sm">Aucun partenaire ne peut voir cette intervention ni recevoir sa notification avant votre validation.</p>:null}
      {data.decision==="internal"?<p className="mt-2 text-sm">Le dossier reste traité en interne. Les notes, statuts et prochaines actions restent disponibles.</p>:null}
      {data.decision==="legacy"?<p className="mt-2 text-sm">Une acquisition est déjà engagée ou le dossier est attribué. Ses conditions restent inchangées.</p>:null}
      {data.notification?<div className="mt-3 rounded-md bg-sanispa-ice p-3 text-sm"><p className="font-semibold">Notification du partenaire</p><p className="mt-1">{partnerNotificationLabel(data.notification)}</p>{data.notification.state==="sent" && data.notification.sentAt?<p className="mt-1">Le {new Date(data.notification.sentAt).toLocaleString("fr-FR",{timeZone:"Europe/Paris"})}. La réception par le destinataire n’est pas confirmée ici.</p>:null}</div>:null}
      {!intent && (data.canKeep || data.canRelease)?<div className="mt-4 flex flex-wrap gap-3">
        {data.canKeep?<button type="button" onClick={()=>setIntent("keep")} className="focus-ring rounded-md border border-sanispa-line px-4 py-3 text-sm font-bold">Conserver chez SANISPA</button>:null}
        {data.canRelease?<button type="button" onClick={()=>setIntent("release")} className="focus-ring rounded-md bg-sanispa-navy px-4 py-3 text-sm font-bold text-white">Transmettre à un partenaire</button>:null}
      </div>:null}
      {intent?<form onSubmit={decide} className="mt-4 grid gap-3 rounded-md bg-sanispa-ice p-3">
        {intent==="keep"?<p className="text-sm">Confirmez le traitement interne de ce dossier. Il ne sera pas proposé aux partenaires.</p>:<>
          <label className="grid gap-2 text-sm font-bold">Partenaire couvrant le département<select required value={selected} onChange={e=>setSelected(e.target.value)} disabled={saving} className="focus-ring min-h-12 min-w-0 w-full rounded-md border p-2 font-normal"><option value="">Sélectionner un partenaire</option>{data.partners.map(p=><option key={p.id} value={p.id}>{p.company_name} · {p.leads_paid?"Payant":"Gratuit"}</option>)}</select></label>
          {!data.partners.length?<p className="text-sm">Aucun partenaire actif ne couvre ce département. Complétez sa couverture dans Administration → Partenaires.</p>:<p className="text-sm">Seul ce destinataire pourra consulter l’offre. La transmission n’effectue ni achat ni prise en charge et ne débloque pas les coordonnées.</p>}
        </>}
        <div className="flex flex-wrap gap-3"><button disabled={saving || (intent==="release"&&!selected)} type="submit" className="focus-ring rounded-md bg-sanispa-navy px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?"Enregistrement en cours…":intent==="keep"?"Confirmer : conserver chez SANISPA":"Confirmer la transmission"}</button><button type="button" disabled={saving} onClick={()=>setIntent(null)} className="focus-ring rounded-md border px-4 py-3 text-sm font-bold">Annuler</button></div>
      </form>:null}
      {data.decision==="pending"&&!data.canRelease?<p className="mt-3 text-sm">La transmission n’est pas disponible avec l’archivage ou le statut de traitement actuel.</p>:null}
    </>:null}
    <button type="button" disabled={loading||saving} onClick={()=>{setMessage("");void load().catch(()=>setMessage("Actualisation impossible. Réessayez dans un instant."));}} className="focus-ring mt-3 rounded-md px-2 py-2 text-sm font-bold text-sanispa-blue disabled:opacity-50">{loading?"Actualisation…":"Actualiser l’état"}</button>
    {message?<p role="status" className="mt-3 text-sm">{message}</p>:null}
  </section>;
}
