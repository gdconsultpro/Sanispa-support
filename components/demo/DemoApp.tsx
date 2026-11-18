"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Download, Eye, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/Button";
import { createDemoState, demoNavigation, demoReducer, demoView, type DemoAction, type DemoRole, type DemoState } from "@/lib/demo";
import { demoDocumentLines, demoDocumentTitles, type DemoPdfKind } from "@/lib/demo-pdf";
import { DemoClient } from "./DemoClient";
import { DemoPartner } from "./DemoPartner";
import { DemoAdmin } from "./DemoAdmin";
import type { DemoContext } from "./DemoShared";

const roles = [{ id: "client", label: "Particulier", description: "Camille · propriétaire de spa" }, { id: "partenaire", label: "Technicien / partenaire", description: "Atelier Aqua · entreprise fictive" }, { id: "admin", label: "SANISPA / administrateur", description: "Pilotage fictif de l’activité" }] as const;
const tour: { role: DemoRole; tab: string; title: string; text: string }[] = [
  { role: "client", tab: "accueil", title: "Une application pour accompagner le propriétaire", text: "Présentez la version gratuite et le Premium. Le bouton permet de comparer les deux offres sans paiement." },
  { role: "client", tab: "declaration", title: "Un questionnaire centré sur le besoin", text: "Changez la panne et montrez les questions adaptées. Simulez une déclaration pour repartir de la validation SANISPA." },
  { role: "admin", tab: "demandes", title: "SANISPA garde la décision", text: "Gardez un chantier ou validez sa proposition au partenaire. L’envoi et la notification sont simulés." },
  { role: "partenaire", tab: "demandes", title: "Un contact qualifié, des coordonnées protégées", text: "Présentez l’aperçu, puis confirmez le règlement fictif pour illustrer le déblocage des coordonnées." },
  { role: "partenaire", tab: "planning", title: "Préparer l’intervention", text: "Choisissez un créneau fictif. Il sera visible dans les points de vue client et SANISPA." },
  { role: "partenaire", tab: "rapport", title: "Un retour structuré du professionnel", text: "Transmettez le rapport fictif et joignez la facture d’exemple, sans ajouter de vrai document." },
  { role: "client", tab: "documents", title: "Le client donne son retour", text: "Choisissez l’issue de l’intervention et renseignez les trois notes. Les rapports et factures restent gratuits." },
  { role: "client", tab: "ia", title: "Un accompagnement Premium au quotidien", text: "Posez une question avec un relevé d’eau. Les réponses sont simulées pour présenter le service sans coût IA." },
  { role: "client", tab: "carnet", title: "Un carnet qui relie entretien et eau", text: "Ajoutez un relevé, une note ou un rappel. Un entretien effectué rejoint le journal de démonstration." },
  { role: "client", tab: "notices", title: "Retrouver la bonne documentation", text: "Cherchez une marque ou une référence de clavier et ouvrez un exemple de document." },
  { role: "client", tab: "forum", title: "Un forum Premium entre particuliers", text: "Soumettez un message fictif. Il attendra une validation dans le point de vue administrateur." },
  { role: "admin", tab: "moderation", title: "Une communauté modérée", text: "Approuvez ou refusez le message. Revenez à la vue client pour constater le résultat." },
  { role: "admin", tab: "pilotage", title: "Garder une vue sur les abonnements et les usages", text: "Présentez les indicateurs fictifs, puis explorez les partenaires et la préparation Synchroteam avec le menu." },
];
function DemoDocumentModal({ kind, state, close, notify }: { kind: DemoPdfKind; state: DemoState; close: () => void; notify: (text: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function download() {
    setBusy(true);
    try {
      const { buildDemoPdf } = await import("@/lib/demo-pdf");
      const response = await fetch("/sanispa-logo.png");
      const logo = response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
      const bytes = await buildDemoPdf(kind, state, logo), buffer = new Uint8Array(bytes.length); buffer.set(bytes);
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = `SANISPA-DEMO-${kind}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { notify("Le PDF de démonstration n’a pas pu être créé. Vous pouvez consulter l’aperçu à l’écran."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }} className="max-h-[90dvh] w-[min(92vw,720px)] rounded-3xl border border-sanispa-line p-0 text-sanispa-navy shadow-soft backdrop:bg-sanispa-navy/50"><div className="p-5 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-sanispa-blue">SANISPA · Document fictif</p><h2 className="mt-2 text-2xl font-bold">{demoDocumentTitles[kind]}</h2></div><button className="focus-ring rounded-full p-2 hover:bg-sanispa-ice" aria-label="Fermer le document" onClick={close}><X size={22} /></button></div><p className="my-5 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-950">DÉMONSTRATION — SANS VALEUR COMPTABLE</p><div className="space-y-3 rounded-2xl border border-sanispa-line p-5 text-sm leading-7">{demoDocumentLines(kind, state).map((line, i) => <p className="break-words" key={i}>{line}</p>)}</div><div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => void download()} disabled={busy}><Download size={17} aria-hidden="true" />{busy ? "Création du PDF…" : "Télécharger le PDF démo"}</Button><Button variant="secondary" onClick={close}>Fermer</Button></div></div></dialog>;
}
export function DemoApp({ initialRole = "client", initialTab = "accueil" }: { initialRole?: DemoRole; initialTab?: string }) {
  const [view, setView] = useState(() => demoView(initialRole, initialTab));
  const [state, dispatch] = useReducer(demoReducer, initialRole, createDemoState);
  const [message, setMessage] = useState("Bienvenue : tout ce que vous modifiez ici est fictif et limité à cette page."), [guide, setGuide] = useState(false), [step, setStep] = useState(0), [document, setDocument] = useState<DemoPdfKind | null>(null), [share, setShare] = useState("");
  function go(role: DemoRole, tab: string) {
    const next = demoView(role, tab); setView(next);
    window.history.replaceState(null, "", `/demo?espace=${next.role}&onglet=${next.tab}`);
  }
  function act(action: DemoAction, notice?: string) { dispatch(action); if (notice) setMessage(notice); }
  function move(index: number) { const next = Math.max(0, Math.min(tour.length - 1, index)); setStep(next); go(tour[next].role, tour[next].tab); }
  async function copy(role: DemoRole) {
    const url = `${window.location.origin}/demo?espace=${role}`; setShare(url);
    try { await navigator.clipboard.writeText(url); setMessage("Lien de démonstration copié. Il peut être ouvert sans compte."); }
    catch { setMessage("Le lien est affiché ci-dessous : vous pouvez le sélectionner et le copier."); }
  }
  const context: DemoContext = { state, act, go, showDocument: setDocument, notify: setMessage };
  const activeRole = roles.find(role => role.id === view.role)!;
  return <main className="min-h-screen bg-[#f2f7fa] text-sanispa-navy"><div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-center text-xs font-bold text-amber-950"><Eye size={15} aria-hidden="true" /><span>DÉMONSTRATION · Données fictives</span><span className="font-normal">Aucun paiement, aucun e-mail, aucune modification d’un vrai dossier.</span></div>
    <header className="border-b border-sanispa-line bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"><div className="flex items-center gap-4"><Image src="/sanispa-logo.png" width={88} height={62} alt="SANISPA" className="h-12 w-auto" priority /><div><p className="text-sm font-bold">SANISPA Support</p><p className="mt-1 text-xs text-sanispa-steel">L’application, côté client et professionnel</p></div></div><div className="flex flex-wrap items-center gap-2"><Button variant="secondary" onClick={() => { setGuide(!guide); if (!guide) move(0); }}><Play size={16} aria-hidden="true" />{guide ? "Fermer le guide" : "Mode présentation"}</Button><Button variant="ghost" onClick={() => { dispatch({ type: "reset", role: view.role }); setDocument(null); setStep(0); setMessage("Démo remise à zéro. Aucun dossier réel n’a été modifié."); }}><RotateCcw size={16} aria-hidden="true" />Recommencer la démo</Button><Link prefetch={false} href="/" className="focus-ring rounded-lg px-3 py-3 text-xs font-bold underline">Quitter la démo</Link></div></div></header>
    <div className={`mx-auto max-w-7xl px-4 pb-10 pt-7 sm:px-6 ${guide ? "space-y-5" : "space-y-6"}`}><section className="overflow-hidden rounded-3xl bg-sanispa-navy p-6 text-white sm:p-8"><div className="flex flex-wrap items-start justify-between gap-6"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">Découvrez · essayez · présentez</p><h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Un spa suivi. Des clients accompagnés.<br className="hidden sm:block" /> Un réseau de professionnels.</h1><p className="mt-4 max-w-xl text-sm leading-7 text-slate-200">Explorez les trois points de vue et faites avancer un dossier fictif. Chaque visite repart avec ses propres données : aucun compte n’est nécessaire.</p></div><div className="max-w-sm rounded-2xl border border-white/20 bg-white/10 p-4 text-sm"><p className="flex items-center gap-2 font-bold"><ShieldCheck size={18} aria-hidden="true" />Un espace pour essayer librement</p><p className="mt-3 leading-6 text-slate-200">L’IA et les règlements sont simulés. Le vrai espace administrateur reste protégé par sa connexion et son code de sécurité.</p><button className="focus-ring mt-3 rounded-lg bg-white px-4 py-3 text-xs font-bold text-sanispa-navy" onClick={() => void copy("partenaire")}><Copy size={14} className="mr-2 inline" aria-hidden="true" />Copier le lien pour un technicien</button></div></div></section>
      {share ? <label className="block rounded-xl border border-sanispa-line bg-white p-4 text-xs font-bold">Lien public de démonstration<input type="url" readOnly className="focus-ring mt-2 block w-full rounded-lg bg-sanispa-ice p-3 font-normal" value={share} onFocus={e => e.currentTarget.select()} /></label> : null}
      {guide ? <section aria-label="Guide de présentation" className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-widest text-sanispa-blue">Scène {step + 1} / {tour.length}</p><h2 className="mt-2 text-xl font-bold">{tour[step].title}</h2><p className="mt-3 text-sm leading-6 text-sanispa-steel">{tour[step].text}</p></div><div className="flex gap-2"><Button variant="secondary" disabled={step === 0} onClick={() => move(step - 1)} aria-label="Scène précédente"><ArrowLeft size={18} /></Button><Button disabled={step === tour.length - 1} onClick={() => move(step + 1)} aria-label="Scène suivante"><ArrowRight size={18} /></Button></div></div><div className="mt-4 flex gap-1.5" aria-label="Progression de la présentation">{tour.map((scene, i) => <button key={scene.title} onClick={() => move(i)} aria-label={`Scène ${i + 1} : ${scene.title}`} aria-current={i === step ? "step" : undefined} className={`focus-ring h-2 min-w-0 flex-1 rounded-full ${i === step ? "bg-sanispa-blue" : "bg-cyan-200"}`} />)}</div></section> : null}
      <nav aria-label="Choisir le point de vue" className="grid gap-3 lg:grid-cols-3">{roles.map(role => <button key={role.id} onClick={() => go(role.id, demoNavigation[role.id][0].id)} aria-pressed={view.role === role.id} className={`focus-ring flex min-h-20 items-center justify-between gap-4 rounded-2xl border-2 px-5 py-4 text-left transition ${view.role === role.id ? "border-sanispa-blue bg-white shadow-soft" : "border-transparent bg-white/70 hover:border-sanispa-line"}`}><span><span className="block font-bold">{role.label}</span><span className="mt-1 block text-xs text-sanispa-steel">{role.description}</span></span>{view.role === role.id ? <CheckCircle2 size={21} className="shrink-0 text-sanispa-blue" aria-hidden="true" /> : <ArrowRight size={20} className="shrink-0 text-slate-400" aria-hidden="true" />}</button>)}</nav>
      <div className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-2"><nav aria-label={`Rubriques ${activeRole.label}`} className="flex min-w-0 flex-wrap gap-2">{demoNavigation[view.role].map(item => <button key={item.id} className={`focus-ring min-h-11 rounded-xl px-4 py-3 text-sm font-bold ${view.tab === item.id ? "bg-sanispa-navy text-white" : "text-sanispa-steel hover:bg-sanispa-ice"}`} aria-current={view.tab === item.id ? "page" : undefined} onClick={() => go(view.role, item.id)}>{item.label}</button>)}</nav></div>
      <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><CheckCircle2 size={19} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{message}</span></div>
      <section aria-label={`Espace de démonstration ${activeRole.label}`} className="min-w-0">{view.role === "client" ? <DemoClient {...context} tab={view.tab} /> : view.role === "partenaire" ? <DemoPartner {...context} tab={view.tab} /> : <DemoAdmin {...context} tab={view.tab} />}</section>
      <footer className="flex flex-wrap justify-between gap-4 border-t border-sanispa-line pt-6 text-xs leading-6 text-sanispa-steel"><p>SANISPA · Démonstration interactive<br />Rechargez la page ou utilisez « Recommencer » pour repartir de zéro.</p><p className="max-w-xl">Les données ne sont ni enregistrées dans les comptes réels, ni partagées avec d’autres visiteurs. Les documents téléchargés portent la mention démonstration.</p></footer>
    </div>{document ? <DemoDocumentModal kind={document} state={state} close={() => setDocument(null)} notify={setMessage} /> : null}
  </main>;
}
