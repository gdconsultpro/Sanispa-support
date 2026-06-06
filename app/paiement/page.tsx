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

  async function checkout() {
    if (paidAccessUrl) {
      window.location.href = paidAccessUrl;
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
        description="Réglez l'accompagnement à distance choisi. Le paiement est traité par Stripe."
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
              L'accompagnement à distance est une prestation d'analyse et de conseil. Il ne garantit pas la réparation du spa.
            </p>
            {paidAccessUrl ? (
              <p className="mt-3 rounded-md bg-green-50 p-3 text-sm font-semibold text-green-700">
                Une session payée active existe déjà pour cet email. Vous pouvez reprendre sans repayer.
              </p>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button type="button" onClick={checkout} disabled={!plan || loading} className="mt-5 w-full sm:w-auto">
          {loading ? "Redirection..." : paidAccessUrl ? "Reprendre mon assistance" : "Payer avec Stripe"}
        </Button>
      </section>
    </AppShell>
  );
}
