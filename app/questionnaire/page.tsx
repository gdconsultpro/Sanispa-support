"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftSave } from "@/components/DraftSave";
import { useClientSession } from "@/components/SessionPrivacy";
import { Field, SelectField } from "@/components/Field";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { DiagnosticQuestion } from "@/components/DiagnosticQuestion";
import { StepHeader } from "@/components/StepHeader";
import { diagnosticSafety, problemTypes, questionSets } from "@/lib/questions";
import {
  isQuestionVisible,
  updateDiagnosticAnswer,
  validateAnswers,
} from "@/lib/diagnostic-answers";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft, saveDraft, writeDraft } from "@/lib/storage";
export default function QuestionnairePage() {
  const router = useRouter();
  const confirmed = Boolean(useClientSession()?.user.email_confirmed_at);
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const stored = readDraft();
    setDraft(stored);
    if (!stored.problemType || stored.problemType === "demenagement") router.replace("/diagnostic");
  }, [router]);
  const questions = draft.problemType ? questionSets[draft.problemType] : [];
  const problemLabel =
    problemTypes.find((item) => item.value === draft.problemType)?.label ?? "";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    try {
      validateAnswers(draft, false);
      if (!draft.installationType) throw new Error("Indiquez si le spa est installé à l’intérieur ou à l’extérieur.");
      setSaving(true);
      if (!confirmed) {
        writeDraft({ ...draft, draftId: draft.draftId || crypto.randomUUID() }, "/upload");
        router.push("/acces?next=diagnostic");
        return;
      }
      await saveDraft(draft, "/upload");
      router.push("/upload");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sauvegarde impossible. Réessayez.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <AppShell compact declarationFlow>
      <StepHeader
        eyebrow="Étape 2"
        title={problemLabel}
        description="Commencez par ce que vous constatez, puis précisez les circonstances. Aucune connaissance technique n’est nécessaire. Seules les réponses marquées d’un * sont obligatoires. Les autres informations sont facultatives ; vous pouvez répondre « Je ne sais pas »."
      />
      <DraftSave draft={draft} step="/questionnaire" sync={confirmed} />
      <BackLink href="/diagnostic" />
      <p className="mb-4 rounded-md bg-sanispa-ice p-4 text-sm leading-6 text-sanispa-navy">
        {draft.problemType === "traitement-eau"
          ? "Recopiez seulement les mesures déjà disponibles et les produits déjà utilisés. Ne mélangez pas les traitements pour compléter ce formulaire."
          : diagnosticSafety}
      </p>
      {draft.problemType && draft.problemType !== "traitement-eau" ? (
        <p className="mb-4 text-sm text-sanispa-steel">
          Si un autre problème existe aussi, utilisez la case « Autre panne à
          déclarer » en fin de questionnaire.
        </p>
      ) : null}
      <form
        onSubmit={submit}
        className="space-y-5 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6"
      >
        {questions
          .filter((q) => isQuestionVisible(q, draft.answers, questions))
          .map((q) => (
            <div key={q.id} className="space-y-4">
              {q.section ? (
                <h2 className="border-b border-sanispa-line pb-2 text-lg font-bold text-sanispa-navy">
                  {q.section}
                </h2>
              ) : null}
              <DiagnosticQuestion
                question={q}
                value={draft.answers[q.id]}
                onChange={(value) => {
                  setError("");
                  setDraft((current) =>
                    updateDiagnosticAnswer(current, q.id, value),
                  );
                }}
              />
            </div>
          ))}
        {!confirmed || !draft.installationType ? <section aria-labelledby="installation-spa" className="space-y-3 border-t border-sanispa-line pt-5">
          <h2 id="installation-spa" className="text-lg font-bold">Votre spa</h2>
          <SelectField label="Type d’installation" name="installationType" value={draft.installationType} required
            options={[{ value: "interieur", label: "Intérieur" }, { value: "exterieur", label: "Extérieur" }]}
            onChange={value => setDraft(current => ({ ...current, installationType: value as DiagnosticDraft["installationType"] }))} />
          {!confirmed ? <details className="rounded-xl border border-sanispa-line p-3">
            <summary className="cursor-pointer font-bold">Préciser le modèle du spa (facultatif)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Marque" name="spaBrand" value={draft.spaBrand} onChange={spaBrand => setDraft(current => ({ ...current, spaBrand }))} />
              <Field label="Modèle" name="spaModel" value={draft.spaModel} onChange={spaModel => setDraft(current => ({ ...current, spaModel }))} />
              <Field label="Année approximative" name="spaYear" value={draft.spaYear} onChange={spaYear => setDraft(current => ({ ...current, spaYear }))} />
            </div>
          </details> : null}
        </section> : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700"
          >
            {error}
          </p>
        ) : null}
        <Button disabled={saving} type="submit" className="w-full sm:w-auto">
          {saving ? "Sauvegarde en cours…" : confirmed ? "Continuer vers les photos" : "Continuer vers mon compte"}
        </Button>
      </form>
    </AppShell>
  );
}
