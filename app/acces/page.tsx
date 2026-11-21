"use client";
import { useEffect,useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CreateAccountForm } from "@/components/CreateAccountForm";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { publicClientIntent } from "@/lib/client-access";
import { emptyDraft,readDraft,writeDraft } from "@/lib/storage";
export default function AccessPage(){
 const [ready,setReady]=useState(false),[email,setEmail]=useState(""),[problem,setProblem]=useState<string|undefined>(),[intent,setIntent]=useState<ReturnType<typeof publicClientIntent>>("compte");
 useEffect(()=>{const draft=readDraft();const next=publicClientIntent(new URLSearchParams(window.location.search).get("next")||"compte");setEmail(draft.email);setProblem(draft.problemType||undefined);setIntent(next);setReady(true);const {data}=getSupabaseBrowser().auth.onAuthStateChange((_event,session)=>{if(session?.user.email_confirmed_at)window.location.replace(`/auth/retour?next=${next}`);});return()=>data.subscription.unsubscribe();},[]);
 function remember(address: string) {
   const draft = readDraft();
   const isLocalDeclaration = intent === "diagnostic" && !draft.version && !draft.diagnosticId;
   const belongsToAddress = draft.email.trim().toLowerCase() === address;
   writeDraft(isLocalDeclaration || belongsToAddress ? { ...draft, email: address } : { ...emptyDraft, email: address });
 }
 return <AppShell compact><section className="mx-auto max-w-lg rounded-3xl border border-sanispa-line bg-white p-6 sm:p-8"><h1 className="text-3xl font-bold">Créer mon compte</h1><p className="my-5 leading-7">Votre e-mail, un mot de passe et un seul mail de confirmation. {intent==="diagnostic"?"Votre déclaration est conservée sur cet appareil ; vous la retrouverez juste après confirmation.":"Retrouvez ensuite votre spa, son historique et tous vos services gratuits."}</p>{ready?<CreateAccountForm intent={intent} initialEmail={email} problemType={problem} beforeSubmit={remember}/>:<p role="status">Chargement…</p>}</section></AppShell>;
}
