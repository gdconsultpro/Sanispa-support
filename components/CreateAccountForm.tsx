"use client";
import { useRef,useState } from "react";
import Link from "next/link";
import { Button } from "./Button";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { withPartnerTimeout } from "@/lib/partner-navigation";
import { partnerAuthError } from "@/lib/partner-browser";
import type { publicClientIntent } from "@/lib/client-access";
import type { SignupDraft } from "@/lib/client-drafts";
export function CreateAccountForm({intent,initialEmail="",problemType,beforeSubmit}:{intent:ReturnType<typeof publicClientIntent>;initialEmail?:string;problemType?:string;beforeSubmit?:(email:string)=>SignupDraft | undefined}){
 const [email,setEmail]=useState(initialEmail),[password,setPassword]=useState(""),[visible,setVisible]=useState(false),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");const pending=useRef(false);
 const [existing, setExisting] = useState(false);
 const partner = intent === "partenaire";
 function changeMode(mode: boolean) {
   setPassword("");
   setError("");
   setExisting(mode);
 }
 async function submit(event: React.FormEvent) {
   event.preventDefault();
   if (pending.current || sent) return;
   pending.current = true;
   setBusy(true);
   setError("");
   try {
     const address = email.trim().toLowerCase();
     if (existing) {
       const { data, error } = await withPartnerTimeout(getSupabaseBrowser().auth.signInWithPassword({ email: address, password }));
       if (error) throw error;
       if (!data.session) throw new Error("La connexion n’a pas ouvert de session. Réessayez.");
       window.location.replace("/partenaire/inscription");
       return;
     }
     const draft = beforeSubmit?.(address);
     const response = await fetch("/api/client/register", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ email: address, password, next: intent, problemType, draft }),
     });
     const body = await response.json();
     if (partner && response.status === 409 && body.code === "ACCOUNT_EXISTS") {
       changeMode(true);
       setError("Cette adresse est déjà utilisée sur SANISPA. Saisissez votre mot de passe actuel pour continuer côté partenaire.");
       return;
     }
     if (!response.ok) throw new Error(body.error || "Création impossible.");
     setPassword("");
     setSent(true);
   } catch (error) {
     setError(existing ? partnerAuthError(error) : error instanceof Error ? error.message : "Création impossible. Réessayez.");
   } finally {
     pending.current = false;
     setBusy(false);
   }
 }
 const login=partner?"/partenaire/connexion":`/connexion?next=${intent}`;
 if(sent)return <div className="space-y-4"><p role="status" className="rounded-xl bg-emerald-50 p-4 leading-7">Un e-mail de confirmation a été envoyé à <strong className="break-all">{email}</strong>. Cliquez sur son lien pour confirmer votre adresse et continuer. Aucun autre code à saisir.</p><p className="text-sm leading-6">Pensez aux courriers indésirables. Si vous aviez déjà commencé une inscription, votre mot de passe initial est conservé.</p><Link className="inline-block font-bold underline" href={login}>Me connecter</Link></div>;
 return <form onSubmit={submit} className="grid gap-4">
   {partner ? <button type="button" className="focus-ring justify-self-start font-bold underline" disabled={busy}
     onClick={() => changeMode(!existing)}>{existing ? "Créer un compte SANISPA" : "J’ai déjà un compte SANISPA"}</button> : null}
   <label className="font-bold">Adresse e-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="focus-ring mt-2 w-full min-w-0 rounded-xl border border-sanispa-line p-3 font-normal"/></label>
   <label className="font-bold">{existing ? "Mon mot de passe SANISPA" : "Créer mon mot de passe"}
     <input type={visible?"text":"password"} autoComplete={existing ? "current-password" : "new-password"}
       aria-describedby={existing ? undefined : "signup-password-help"} required minLength={existing ? undefined : 12}
       maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}
       className="focus-ring mt-2 w-full min-w-0 rounded-xl border border-sanispa-line p-3 font-normal"/>
   </label>
   {!existing ? <p id="signup-password-help" className="text-xs font-normal text-sanispa-steel">12 caractères minimum. Une phrase facile à retenir convient.</p> : null}
   <button type="button" className="focus-ring justify-self-start text-sm underline" onClick={()=>setVisible(v=>!v)}>{visible?"Masquer":"Afficher"} le mot de passe</button>
   {error?<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>:null}
   <Button type="submit" disabled={busy}>{busy ? "Vérification du compte…" : existing ? "Se connecter et continuer" : "Créer mon compte gratuit"}</Button>
   {existing ? <Link href="/mot-de-passe-oublie" className="font-bold underline">Mot de passe oublié</Link>
     : <p className="text-sm">Un seul e-mail confirme votre adresse. Aucun paiement demandé.</p>}
   {!partner ? <Link href={login} className="font-bold underline">J’ai déjà un compte · Me connecter</Link> : null}
 </form>;
}
