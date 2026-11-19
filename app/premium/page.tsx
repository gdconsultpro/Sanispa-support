"use client";
import { paymentsPaused } from "@/lib/commercial-mode";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, ButtonLink } from "@/components/Button";
import { clientRequest } from "@/lib/client-browser-api";
const features = [
  { title: "Mon assistant IA", text: "Eau, symptômes d’une panne, entretien : posez vos questions et avancez à votre rythme.", href: "/premium/assistant" },
  { title: "Mon carnet et mes rappels", text: "Gardez une trace des entretiens et préparez vos rappels de vidange, filtres et consommables.", href: "/premium/carnet" },
  { title: "Mes relevés d’eau", text: "Notez vos mesures et transmettez un relevé à l’IA pour comprendre les ajustements.", href: "/premium/releves" },
  { title: "Les notices de mon spa", text: "Recherchez les ressources vérifiées par marque et référence de commande.", href: "/premium/notices" },
  { title: "Le forum des particuliers", text: "Échangez entre propriétaires dans un espace modéré par Gilles, sans publication des partenaires.", href: "/premium/forum" },
];
export default function PremiumPage() {
  const [subscription, setSubscription] = useState<{ status: string; paid_until: string } | null>(null), [active, setActive] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    try { const r = await clientRequest("/api/client/premium"); setSubscription(r.subscription); setActive(r.active); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible."); }
    finally { setLoaded(true); }
  }
  useEffect(() => { void load(); }, []);
  async function checkout(action: "subscribe" | "portal") {
    if (busy) return; setBusy(true); setError("");
    try { const r = await clientRequest("/api/client/premium", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); if (!r.url) throw new Error("Paiement indisponible."); window.location.assign(r.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Opération impossible."); }
    finally { setBusy(false); }
  }
  if (paymentsPaused()) return <AppShell><p className="text-sm font-bold uppercase tracking-widest text-sanispa-blue">Votre accompagnement SANISPA</p><h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight">Tous vos services sont gratuits.</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-sanispa-steel">Profitez de l’assistant, du carnet, des rappels, des relevés d’eau, des notices et du forum gratuitement, dès la création de votre compte. Aucun abonnement à souscrire, aucune carte bancaire.</p><div className="my-6 flex flex-wrap gap-3"><ButtonLink href="/premium/assistant">Ouvrir mon assistant</ButtonLink><ButtonLink href="/acces?next=premium" variant="secondary">Créer mon compte / me connecter</ButtonLink></div><div className="grid gap-5 md:grid-cols-2">{features.map(feature => <Link key={feature.href} href={feature.href} className="focus-ring rounded-3xl border border-sanispa-line bg-white p-6"><span className="text-xs font-bold uppercase tracking-widest text-sanispa-blue">Accès gratuit</span><h2 className="mt-3 text-2xl font-bold">{feature.title} →</h2><p className="mt-3 leading-7 text-sanispa-steel">{feature.text}</p></Link>)}</div><p className="mt-6 text-sm leading-7 text-sanispa-steel">Votre compte conserve vos informations privées. L’IA apporte une aide sans garantie de diagnostic et ne remplace pas un technicien. Les limites de cadence protègent le service ; aucun quota mensuel de messages ne s’applique à un usage personnel normal.</p></AppShell>;
  return <AppShell><p className="text-sm font-bold uppercase tracking-widest text-sanispa-blue">SANISPA Premium</p><h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight">Votre spa, bien accompagné toute l’année.</h1>
    <p className="mt-5 max-w-3xl text-lg leading-8">Un assistant à vos côtés, un carnet pour vous repérer et les bons rappels au bon moment.</p>
    <div className="mt-7 grid gap-5 md:grid-cols-2"><section className="rounded-2xl border border-sanispa-line bg-white p-6"><h2 className="text-2xl font-bold">Gratuit</h2><p className="mt-3 text-3xl font-bold">0 €</p><ul className="my-5 space-y-3"><li>Prédiagnostic et déclaration de panne</li><li>Demande de devis et mise en relation avec un technicien</li><li>Liens vers la boutique SANISPA</li><li>Suivi, validation des interventions, rapports et factures</li></ul><ButtonLink href="/diagnostic?new=1" variant="secondary">Déclarer ma panne gratuitement</ButtonLink></section>
      <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6"><h2 className="text-2xl font-bold">Premium</h2><p className="mt-3 text-4xl font-bold">9,99 € <span className="text-base">TTC / mois</span></p><p className="mt-2 text-sm">TVA à 20 % incluse · abonnement mensuel renouvelé automatiquement</p><ul className="my-5 space-y-3"><li>Tous les services gratuits</li><li>IA illimitée pour un usage personnel normal : eau, panne, entretien</li><li>Notices, journal de bord, relevés d’eau et rappels d’entretien</li><li>Forum privé des particuliers</li></ul>
        {!loaded ? <p role="status">Vérification de votre accès…</p> : active ? <p role="status" className="font-bold">Votre Premium est actif jusqu’au {new Date(subscription!.paid_until).toLocaleDateString("fr-FR")}.</p> : <Button disabled={busy || Boolean(subscription && (subscription.status !== "canceled" || Date.parse(subscription.paid_until) > Date.now()))} onClick={() => void checkout("subscribe")}>M’abonner — 9,99 € TTC par mois</Button>}
        {subscription ? <Button className="mt-3" disabled={busy} onClick={() => void checkout("portal")}>Gérer, consulter mes factures ou résilier</Button> : <Link className="mt-4 block font-bold underline" href="/acces?next=premium">Créer mon compte / me connecter</Link>}
        <p className="mt-4 text-sm leading-6">Pas de quota mensuel de messages pour un usage personnel normal. Les envois automatisés et les demandes simultanées sont limités. L’IA apporte une aide sans garantie de diagnostic et ne remplace pas une intervention professionnelle. La résiliation arrête les prochains renouvellements ; l’accès reste disponible jusqu’à la fin de la période réglée, hors remboursement ou litige.</p>
      </section></div>
    {error ? <p role="alert" className="mt-4 rounded-xl bg-white p-4 text-red-800">{error}</p> : null}<button onClick={() => void load()} disabled={busy} className="my-5 font-bold underline">Actualiser mon abonnement</button>
    <div className="grid gap-4 sm:grid-cols-2">{features.map(f => <Link href={f.href} key={f.href} className="rounded-2xl border border-sanispa-line bg-white p-5 focus-ring"><h2 className="text-xl font-bold">{f.title} →</h2><p className="mt-3 leading-7 text-sanispa-steel">{f.text}</p></Link>)}</div>
  </AppShell>;
}
