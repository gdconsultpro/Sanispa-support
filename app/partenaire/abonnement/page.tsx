"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import {
  subscriptionPlans,
  leadCatalog,
  activeSubscription,
  type SubscriptionPlan,
} from "@/lib/partner-catalog";
import { partnerToken } from "@/lib/partner-browser";
export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<{
      plan: SubscriptionPlan;
      status: string;
      paid_until: string;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    setLoading(true);
    try {
      const token = await partnerToken("/partenaire/abonnement");
      if (!token) return;
      const r = await fetch("/api/partner/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setSubscription(body.subscription);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function checkout(plan?: SubscriptionPlan) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const token = await partnerToken("/partenaire/abonnement");
      if (!token) return;
      const r = await fetch("/api/partner/subscription", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          plan ? { action: "subscribe", plan } : { action: "portal" },
        ),
      });
      const body = await r.json();
      if (!r.ok || !body.url)
        throw new Error(body.error || "Paiement indisponible.");
      window.location.assign(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paiement indisponible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell compact>
      <Link href="/partenaire" className="font-bold underline">
        ← Espace partenaire
      </Link>
      <h1 className="mt-5 text-3xl font-bold">Mon abonnement</h1>
      <p className="my-4 text-sanispa-steel">
        Tous les tarifs sont TTC. Chaque dossier reste soumis à la validation de
        SANISPA, quel que soit l’abonnement.
      </p>
      {error ? (
        <p role="alert" className="my-4 text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Vérification de votre abonnement…</p>
      ) : (
        <>
          <p role="status" className="mb-4 rounded-xl bg-white p-4">
            {subscription
              ? `${subscriptionPlans[subscription.plan].label} · ${activeSubscription(subscription) ? "Actif" : "Non actif"} · Période réglée jusqu’au ${new Date(subscription.paid_until).toLocaleDateString("fr-FR")}`
              : "Aucun abonnement confirmé. Un retour de paiement ne vaut pas confirmation : attendez sa validation puis actualisez."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(subscriptionPlans).map(([key, plan]) => (
              <section
                key={key}
                className="rounded-2xl border border-sanispa-line bg-white p-6"
              >
                <h2 className="text-xl font-bold">{plan.label}</h2>
                <p className="my-3 text-3xl font-bold">
                  {plan.amount / 100} €{" "}
                  <span className="text-base">TTC / mois</span>
                </p>
                <p className="mb-5 leading-7">{plan.description}</p>
                <Button
                  disabled={
                    busy ||
                    Boolean(
                      subscription &&
                        (subscription.status !== "canceled" ||
                          Date.parse(subscription.paid_until) > Date.now()),
                    )
                  }
                  onClick={() => void checkout(key as SubscriptionPlan)}
                >
                  Souscrire — paiement mensuel
                </Button>
              </section>
            ))}
          </div>
          {subscription ? (
            <Button
              className="mt-5"
              disabled={busy}
              onClick={() => void checkout()}
            >
              Factures, moyen de paiement et résiliation
            </Button>
          ) : null}
        </>
      )}
      <button
        className="my-5 block font-bold underline"
        disabled={busy || loading}
        onClick={() => void load()}
      >
        Actualiser l’abonnement
      </button>
      <section className="rounded-2xl bg-white p-6">
        <h2 className="mb-3 text-xl font-bold">
          Prix des contacts — offre à 300 €/mois
        </h2>
        <dl className="grid gap-2">
          {Object.entries(leadCatalog).map(([key, item]) => (
            <div className="flex justify-between gap-4" key={key}>
              <dt>{item.label}</dt>
              <dd className="font-bold">{item.amount / 100} € TTC</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm">
          L’offre à 700 €/mois inclut ces contacts après validation SANISPA et
          acceptation du dossier. L’abonnement ne garantit pas un nombre de
          demandes.
        </p>
      </section>
    </AppShell>
  );
}
