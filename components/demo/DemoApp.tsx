"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Download, Eye, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/Button";
import { createDemoState, demoNavigation, demoReducer, demoView, type DemoAction, type DemoRole, type DemoState } from "@/lib/demo";
import { demoDocumentLines, demoDocumentTitles, type DemoPdfKind } from "@/lib/demo-pdf";
import { DemoVideoAssistance } from "./DemoVideo";
import { DemoClient } from "./DemoClient";
import { DemoPartner } from "./DemoPartner";
import { DemoAdmin } from "./DemoAdmin";
import type { DemoContext } from "./DemoShared";

const roles = [{ id: "client", label: "Client particulier", description: "Camille · propriétaire de spa" }, { id: "partenaire", label: "Partenaire", description: "Atelier Aqua · entreprise fictive" }, { id: "admin", label: "Administrateur", description: "Pilotage fictif de l’activité" }] as const;
const tour: { role: DemoRole; tab: string; title: string; text: string }[] = [
  { role: "client", tab: "accueil", title: "Une application pour accompagner le propriétaire", text: "Présentez la version gratuite et le Premium. Tous les services Premium sont actuellement offerts." },
  { role: "client", tab: "declaration", title: "Un questionnaire centré sur le besoin", text: "Changez la panne et montrez les questions adaptées. Simulez une déclaration pour repartir de la validation SANISPA." },
  { role: "admin", tab: "demandes", title: "SANISPA garde la décision", text: "Gardez un chantier ou validez sa proposition au partenaire. L’envoi et la notification sont simulés." },
  { role: "partenaire", tab: "demandes", title: "Un contact qualifié, des coordonnées protégées", text: "Présentez l’aperçu, puis acceptez le dossier gratuitement pour illustrer le déblocage des coordonnées." },
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
  const [message, setMessage] = useState("Choisissez une rubrique : tous les services sont disponibles pour votre exploration."), [guide, setGuide] = useState(false), [step, setStep] = useState(0), [document, setDocument] = useState<DemoPdfKind | null>(null), [share, setShare] = useState("");
  function go(role: DemoRole, tab: string) { const next = demoView(role, tab); setView(next); window.history.replaceState(null, "", `/demo?espace=${next.role}&onglet=${next.tab}`); }
  function act(action: DemoAction, notice?: string) { dispatch(action); if (notice) setMessage(notice); }
  function move(index: number) { const next = Math.max(0, Math.min(tour.length - 1, index)); setStep(next); go(tour[next].role, tour[next].tab); }
  async function copy() { const url = `${window.location.origin}/demo?espace=partenaire`; setShare(url); try { await navigator.clipboard.writeText(url); setMessage("Lien technicien copié, accessible sans compte."); } catch { setMessage("Le lien est affiché ci-dessous pour être copié."); } }
  const context: DemoContext = { state, act, go, showDocument: setDocument, notify: setMessage };
  const activeRole = roles.find(role => role.id === view.role)!;
  const nextRole: DemoRole = view.role === "client" ? "partenaire" : view.role === "partenaire" ? "admin" : "client";
  const activeTab = demoNavigation[view.role].find(item => item.id === view.tab)!;
  return <main className="min-h-screen bg-[#f7fafc] text-sanispa-navy">
    <header className="sticky top-0 z-30 border-b border-sanispa-line bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"><div className="flex items-center gap-3"><Image src="/sanispa-logo.png" width={88} height={62} alt="SANISPA" className="h-11 w-auto" priority /><div><h1 className="text-xl font-bold">Explorer l’application</h1><p className="text-[11px] text-sanispa-steel">Données fictives · Aucun paiement ni e-mail réel</p></div></div><div className="flex flex-wrap items-center gap-2"><button onClick={() => { setGuide(!guide); if (!guide) move(0); }} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-full border border-sanispa-line px-3 py-2 text-xs font-bold"><Play size={15} aria-hidden="true" />{guide ? "Fermer le guide" : "Visite guidée"}</button><button onClick={() => { dispatch({ type: "reset", role: view.role }); setDocument(null); setStep(0); setMessage("Exemple réinitialisé. Vos comptes réels restent inchangés."); }} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-full border border-sanispa-line px-3 py-2 text-xs font-bold"><RotateCcw size={15} aria-hidden="true" />Recommencer</button><Link href="/" prefetch={false} className="focus-ring px-3 py-2 text-xs font-bold underline">Quitter</Link></div></div>
      <nav aria-label="Choisir le point de vue" className="mx-auto grid max-w-[1440px] grid-cols-3 gap-2 px-4 pb-3 sm:px-6">{roles.map((role, index) => <button key={role.id} onClick={() => go(role.id, demoNavigation[role.id][0].id)} aria-pressed={view.role === role.id} className={`focus-ring flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold sm:text-sm ${view.role === role.id ? "bg-sanispa-blue text-white" : "bg-sanispa-ice text-sanispa-steel hover:bg-blue-100"}`}><span className="hidden rounded-full bg-white/20 px-2 text-xs sm:block">{index + 1}</span>{role.label}{view.role === role.id ? <CheckCircle2 className="shrink-0" size={17} aria-hidden="true" /> : null}</button>)}</nav>
    </header>
    <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-7">
      <aside className="min-w-0"><div className="rounded-2xl border border-sanispa-line bg-white p-3 lg:sticky lg:top-36"><p className="mb-3 hidden px-3 pt-2 text-xs font-bold uppercase tracking-widest text-sanispa-steel lg:block">{activeRole.description}</p><label className="block text-xs font-bold text-sanispa-steel lg:hidden">Choisir une rubrique<select className="focus-ring mt-2 block min-h-12 w-full rounded-xl border border-sanispa-line bg-white p-3 text-sm font-bold text-sanispa-navy" value={view.tab} onChange={event => go(view.role, event.target.value)}>{demoNavigation[view.role].map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><nav aria-label={`Rubriques ${activeRole.label}`} className="hidden min-w-0 flex-col gap-2 lg:flex">{demoNavigation[view.role].map(item => <button key={item.id} className={`focus-ring flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold sm:text-sm ${view.tab === item.id ? "bg-sanispa-ice text-sanispa-blue" : "text-sanispa-steel hover:bg-slate-50"}`} aria-current={view.tab === item.id ? "page" : undefined} onClick={() => go(view.role, item.id)}>{item.label}{view.tab === item.id ? <ArrowRight size={16} aria-hidden="true" /> : null}</button>)}</nav><div className="mt-4 hidden border-t border-sanispa-line px-3 pt-4 lg:block"><p className="flex items-center gap-2 text-xs font-bold"><ShieldCheck size={16} aria-hidden="true" />Tout essayer librement</p><p className="mt-2 text-xs leading-6 text-sanispa-steel">Les trois vues partagent le même dossier fictif. Vos comptes et données réels restent protégés.</p><Link prefetch={false} href={view.role === "client" ? "/espace-client" : view.role === "partenaire" ? "/partenaire" : "/admin/connexion"} className="focus-ring mt-3 block rounded-lg py-2 text-xs font-bold text-sanispa-blue underline">Ouvrir mon espace réel →</Link></div></div></aside>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-sanispa-blue">Espace {view.role === "client" ? "client particulier" : view.role === "partenaire" ? "partenaire" : "administrateur"}</p><h2 className="mt-2 text-3xl font-bold">{activeTab.label}</h2></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => act({ type: "scenario", role: view.role }, "Intervention complète chargée : rapport, facture et demandes de visio disponibles pour explorer sans étapes préalables.")}>Charger un dossier complet</Button><Button className="hidden sm:inline-flex" onClick={() => go(nextRole, demoNavigation[nextRole][0].id)}>Passer {nextRole === "partenaire" ? "au partenaire" : nextRole === "admin" ? "à l’administration" : "au client"}<ArrowRight size={16} aria-hidden="true" /></Button></div></div>
        {guide ? <section aria-label="Guide de présentation" className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-sanispa-blue">Étape {step + 1} / {tour.length}</p><h3 className="mt-2 text-xl font-bold">{tour[step].title}</h3><p className="mt-2 text-sm leading-7 text-sanispa-steel">{tour[step].text}</p></div><div className="flex shrink-0 gap-2"><Button variant="secondary" disabled={step === 0} onClick={() => move(step - 1)} aria-label="Scène précédente"><ArrowLeft size={17} /></Button><Button disabled={step === tour.length - 1} onClick={() => move(step + 1)} aria-label="Scène suivante"><ArrowRight size={17} /></Button></div></div></section> : null}
        <div role="status" aria-live="polite" className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-6 text-sanispa-navy"><Eye size={16} className="mt-1 shrink-0" aria-hidden="true" /><span>{message}</span></div>
        <section aria-label={`Espace de démonstration ${activeRole.label}`} className="min-w-0">{view.tab === "visio" ? <DemoVideoAssistance {...context} role={view.role} /> : view.role === "client" ? <DemoClient {...context} tab={view.tab} /> : view.role === "partenaire" ? <DemoPartner {...context} tab={view.tab} /> : <DemoAdmin {...context} tab={view.tab} />}</section>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-sanispa-line pt-5 text-xs text-sanispa-steel"><p>Chaque visite est indépendante. L’IA et les rendez-vous sont simulés.</p><button className="focus-ring inline-flex items-center gap-2 rounded-full border border-sanispa-line bg-white px-4 py-3 font-bold text-sanispa-blue" onClick={() => void copy()}><Copy size={14} aria-hidden="true" />Copier le lien technicien</button></footer>
        {share ? <label className="block text-xs font-bold">Lien public à partager<input type="url" readOnly className="focus-ring mt-2 block w-full rounded-xl border border-sanispa-line bg-white p-3 font-normal" value={share} onFocus={event => event.currentTarget.select()} /></label> : null}
      </div>
    </div>{document ? <DemoDocumentModal kind={document} state={state} close={() => setDocument(null)} notify={setMessage} /> : null}
  </main>;
}
