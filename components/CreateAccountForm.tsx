"use client";
import { useRef,useState } from "react";
import Link from "next/link";
import { Button } from "./Button";
import type { publicClientIntent } from "@/lib/client-access";
import type { SignupDraft } from "@/lib/client-drafts";
export function CreateAccountForm({intent,initialEmail="",problemType,beforeSubmit}:{intent:ReturnType<typeof publicClientIntent>;initialEmail?:string;problemType?:string;beforeSubmit?:(email:string)=>SignupDraft | undefined}){
 const [email,setEmail]=useState(initialEmail),[password,setPassword]=useState(""),[visible,setVisible]=useState(false),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");const pending=useRef(false);
 async function submit(event: React.FormEvent) {
   event.preventDefault();
   if (pending.current || sent) return;
   pending.current = true;
   setBusy(true);
   setError("");
   try {
     const address = email.trim().toLowerCase();
     const draft = beforeSubmit?.(address);
     const response = await fetch("/api/client/register", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ email: address, password, next: intent, problemType, draft }),
     });
     const body = await response.json();
     if (!response.ok) throw new Error(body.error || "Création impossible.");
     setPassword("");
     setSent(true);
   } catch (error) {
     setError(error instanceof Error ? error.message : "Création impossible. Réessayez.");
   } finally {
     pending.current = false;
     setBusy(false);
   }
 }
 const login=intent==="partenaire"?"/partenaire/connexion":`/connexion?next=${intent}`;
 if(sent)return <div className="space-y-4"><p role="status" className="rounded-xl bg-emerald-50 p-4 leading-7">Un e-mail de confirmation a été envoyé à <strong className="break-all">{email}</strong>. Cliquez sur son lien pour confirmer votre adresse et continuer. Aucun autre code à saisir.</p><p className="text-sm leading-6">Pensez aux courriers indésirables. Si vous aviez déjà commencé une inscription, votre mot de passe initial est conservé.</p><Link className="inline-block font-bold underline" href={login}>Me connecter</Link></div>;
 return <form onSubmit={submit} className="grid gap-4"><label className="font-bold">Adresse e-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="focus-ring mt-2 w-full min-w-0 rounded-xl border border-sanispa-line p-3 font-normal"/></label><label className="font-bold">Créer mon mot de passe<input type={visible?"text":"password"} autoComplete="new-password" aria-describedby="signup-password-help" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} className="focus-ring mt-2 w-full min-w-0 rounded-xl border border-sanispa-line p-3 font-normal"/></label><p id="signup-password-help" className="text-xs font-normal text-sanispa-steel">12 caractères minimum. Une phrase facile à retenir convient.</p><button type="button" className="focus-ring justify-self-start text-sm underline" onClick={()=>setVisible(v=>!v)}>{visible?"Masquer":"Afficher"} le mot de passe</button>{error?<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>:null}<Button type="submit" disabled={busy}>{busy?"Création de mon compte…":"Créer mon compte gratuit"}</Button><p className="text-sm">Un seul e-mail confirme votre adresse. Aucun paiement demandé.</p><Link href={login} className="font-bold underline">J’ai déjà un compte · Me connecter</Link></form>;
}
