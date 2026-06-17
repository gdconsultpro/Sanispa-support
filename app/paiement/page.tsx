"use client";

import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { StepHeader } from "@/components/StepHeader";
import { remotePlans } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft } from "@/lib/storage";

export default function PaymentPage() {
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paidAccessUrl, setPaidAccessUrl] = useState("");
  const [appointmentAccepted, setAppointmentAccepted] = useState(false);

  useEffect(() => {
    const stored = readDraft();
    setDraft(stored);

    if (stored.paymentPlan === "water" && (stored.diagnosticId || stored.email)) {
      fetch("/api/water-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosticId: stored.diagnosticId, email: stored.email })
      })
        .then((response) => response.json())
        .then((payload) => {
          if (payload.active && payload.resumeUrl) setPaidAccessUrl(payload.resumeUrl);
        })
        .catch(() => null);
    }
  }, []);

  const plan = remotePlans.find((item) => item.id === draft.paymentPlan);
  const isHumanAssistance = Boolean(draft.paymentPlan && draft.paymentPlan !== "water");

  async function checkout() {
    if (paidAccessUrl) {
      window.location.href = paidAccessUrl;
      return;
    }

    if (isHumanAssistance && !appointmentAccepted) {
      setError("Veuillez confirmer que l'assistance SANISPA se déroule sur rendez-vous avant de continuer.");
      return;
    }

    setLoading(true);
    setError("");
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnosticId: draft.diagnosticId, paymentPlan: draft.paymentPlan })
    });
    const payload = await response.json();
    if (!response.ok) {
      setLoading(false);
      setError(payload.error ?? "Impossible de lancer le paiement.");
      return;
    }
    window.location.href = payload.url;
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Étape 5"
        title="Paiement sécurisé"
        description="Réglez le diagnostic Traitement d'Eau IA. Le paiement est traité par Stripe."
      />
      <BackLink href="/resume" />
      <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-sanispa-ice text-sanispa-blue">
            <CreditCard size={24} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-sanispa-navy">{plan?.name ?? "Formule non sélectionnée"}</h2>
            <p className="mt-2 text-3xl font-bold text-sanispa-navy">{plan ? `${plan.price} €` : "--"}</p>
            <p className="mt-3 text-sm leading-6 text-sanispa-steel">
              Le diagnostic IA traitement d'eau est une prestation d'analyse et de conseil. Il ne remplace pas une intervention technique si le problème vient du matériel.
            </p>
            {paidAccessUrl ? (
              <p className="mt-3 rounded-md bg-green-50 p-3 text-sm font-semibold text-green-700">
                Une session payée active existe déjà pour cet email. Vous pouvez reprendre sans repayer.
              </p>
            ) : null}
          </div>
        </div>

        {isHumanAssistance && !paidAccessUrl ? (
          <div className="mt-5 rounded-md border border-sanispa-blue bg-sanispa-ice p-4">
            <h3 className="text-base font-bold text-sanispa-navy">Information importante</h3>
            <div className="mt-3 space-y-3 text-sm leading-6 text-sanispa-steel">
              <p>L'assistance SANISPA n'est pas instantanée.</p>
              <p>
                Après validation de votre paiement, notre équipe analysera votre demande puis vous contactera afin de fixer un rendez-vous adapté à votre formule
                (téléphone, photos ou visio).
              </p>
              <p>Le délai de prise de contact dépend de notre planning et de l'urgence de votre demande.</p>
            </div>
            <label className="mt-4 flex cursor-pointer gap-3 rounded-md bg-white p-3 text-sm font-semibold text-sanispa-navy">
              <input
                type="checkbox"
                checked={appointmentAccepted}
                onChange={(event) => setAppointmentAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-sanispa-line text-sanispa-blue"
              />
              <span>J'ai compris que l'assistance SANISPA se déroule sur rendez-vous et non immédiatement après le paiement.</span>
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button type="button" onClick={checkout} disabled={!plan || loading || (isHumanAssistance && !appointmentAccepted && !paidAccessUrl)} className="mt-5 w-full sm:w-auto">
          {loading ? "Redirection..." : paidAccessUrl ? "Reprendre mon assistance" : "Payer avec Stripe"}
        </Button>
      </section>
    </AppShell>
  );
}
