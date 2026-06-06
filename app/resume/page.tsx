"use client";

import { CheckCircle2, CreditCard, FileText, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { DiagnosticSummary } from "@/components/Summary";
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

  const availableRemotePlans = draft.problemType === "traitement-eau" ? remotePlans : remotePlans.filter((plan) => plan.id !== "water");

  async function submit() {
    if (!draft.choice) {
      setError("Veuillez choisir une orientation avant de valider.");
      return;
    }
    if (draft.choice === "remote" && !draft.paymentPlan) {
      setError("Veuillez choisir une formule d'accompagnement à distance.");
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
      router.push("/confirmation");
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
            title="Intervention à domicile"
            text="Votre demande sera transmise à SANISPA. Nous vous recontacterons pour planifier une intervention."
            button="Demander une intervention"
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
          <div className={`rounded-md border bg-white p-4 ${draft.choice === "remote" ? "border-sanispa-blue" : "border-sanispa-line"}`}>
            <div className="flex gap-3">
              <CreditCard size={22} className="mt-1 text-sanispa-blue" aria-hidden="true" />
              <div>
                <h2 className="font-bold text-sanispa-navy">Accompagnement à distance payant</h2>
                <p className="mt-2 text-sm leading-6 text-sanispa-steel">
                  Un technicien SANISPA analyse vos photos et vos réponses, puis vous guide étape par étape à distance. Pour le traitement d'eau, l'assistant peut vous accompagner à partir d'une photo de bandelette ou des valeurs relevées.
                </p>
                <p className="mt-3 rounded-md bg-sanispa-ice p-3 text-sm font-semibold text-sanispa-navy">
                  L'accompagnement à distance est une prestation d'analyse et de conseil. Il ne garantit pas la réparation du spa.
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
