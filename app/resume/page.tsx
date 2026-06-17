"use client";

import { CheckCircle2, CreditCard, FileText, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { DiagnosticSummary } from "@/components/Summary";
import { ShopLinks } from "@/components/ShopLinks";
import { StepHeader } from "@/components/StepHeader";
import { remotePlans } from "@/lib/questions";
import { DiagnosticDraft, PaymentPlan } from "@/lib/types";
import { emptyDraft, readDraft, writeDraft } from "@/lib/storage";

export default function ResumePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = readDraft();
    setDraft(stored);
    if (!stored.problemType) router.push("/diagnostic");
  }, [router]);

  function setChoice(choice: DiagnosticDraft["choice"], paymentPlan: PaymentPlan | "" = "") {
    const next = { ...draft, choice, paymentPlan };
    setDraft(next);
    writeDraft(next);
  }

  const isWaterAnalysis = draft.problemType === "traitement-eau";
  const availableRemotePlans = isWaterAnalysis ? remotePlans.filter((plan) => plan.enabled && plan.id === "water") : [];

  async function submit() {
    if (!draft.choice) {
      setError("Veuillez choisir une orientation avant de valider.");
      return;
    }
    if (draft.choice === "remote" && !draft.paymentPlan) {
      setError("Veuillez choisir le diagnostic IA traitement d'eau.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch("/api/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    const payload = await response.json();
    if (!response.ok) {
      setSaving(false);
      setError(payload.error ?? "Impossible d'enregistrer la demande.");
      return;
    }
    writeDraft({ ...draft, diagnosticId: payload.diagnosticId });
    if (draft.choice === "remote") {
      router.push("/paiement");
    } else {
      router.push(payload.customerEmailSent === false ? "/confirmation?emailSent=0" : "/confirmation?emailSent=1");
    }
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Étape 4"
        title="Résumé et orientation"
        description="Vérifiez les informations, puis choisissez la suite souhaitée pour votre demande SANISPA."
      />
      <BackLink href="/upload" />

      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <DiagnosticSummary draft={draft} />

        <aside className="space-y-4">
          <ChoiceCard
            active={draft.choice === "intervention"}
            icon={<Home size={22} />}
            title="Demande technique gratuite"
            text="Votre dossier technique sera qualifié et préparé pour une future mise en relation selon votre zone géographique."
            button="Créer une demande technique"
            onClick={() => setChoice("intervention")}
          />
          <ChoiceCard
            active={draft.choice === "devis"}
            icon={<FileText size={22} />}
            title="Demande de devis"
            text="SANISPA analysera votre demande et vous transmettra une estimation si les éléments sont suffisants."
            button="Demander un devis"
            onClick={() => setChoice("devis")}
          />
          <ShopLinks problemType={draft.problemType} />

          {isWaterAnalysis ? (
            <div className={`rounded-md border bg-white p-4 ${draft.choice === "remote" ? "border-sanispa-blue" : "border-sanispa-line"}`}>
              <div className="flex gap-3">
                <CreditCard size={22} className="mt-1 text-sanispa-blue" aria-hidden="true" />
                <div>
                  <h2 className="font-bold text-sanispa-navy">Diagnostic Traitement d'Eau IA</h2>
                  <p className="mt-2 text-sm leading-6 text-sanispa-steel">
                    L'assistant IA SANISPA analyse vos valeurs d'eau, votre situation et vos photos éventuelles pour vous guider étape par étape.
                  </p>
                  <p className="mt-3 rounded-md bg-sanispa-ice p-3 text-sm font-semibold text-sanispa-navy">
                    Service géré uniquement par SANISPA. Aucun partenaire n'a accès aux dossiers de traitement d'eau.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {availableRemotePlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setChoice("remote", plan.id)}
                    className={`focus-ring flex min-h-12 items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-bold ${
                      draft.paymentPlan === plan.id ? "border-sanispa-blue bg-sanispa-ice text-sanispa-navy" : "border-sanispa-line bg-white text-sanispa-steel"
                    }`}
                  >
                    <span>{plan.name}</span>
                    <span>{plan.price} €</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <Button type="button" onClick={submit} disabled={saving} className="w-full">
            {saving ? "Enregistrement..." : "Valider la demande"}
          </Button>
        </aside>
      </div>
    </AppShell>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  text,
  button,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  text: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div className={`rounded-md border bg-white p-4 ${active ? "border-sanispa-blue" : "border-sanispa-line"}`}>
      <div className="flex gap-3">
        <div className="mt-1 text-sanispa-blue">{icon}</div>
        <div>
          <h2 className="font-bold text-sanispa-navy">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-sanispa-steel">{text}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="focus-ring mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-sanispa-line bg-sanispa-ice px-3 py-2 text-sm font-bold text-sanispa-navy"
      >
        {active ? <CheckCircle2 size={18} aria-hidden="true" /> : null}
        {button}
      </button>
    </div>
  );
}
