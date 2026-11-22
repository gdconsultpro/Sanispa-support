"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftSave } from "@/components/DraftSave";
import { useClientSession } from "@/components/SessionPrivacy";
import { SelectField } from "@/components/Field";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { DiagnosticQuestion } from "@/components/DiagnosticQuestion";
import { StepHeader } from "@/components/StepHeader";
import { finalPreDiagnosticQuestion, preDiagnosticQuestions, problemTypes } from "@/lib/questions";
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
  const problem = draft.problemType === "demenagement" ? "" : draft.problemType;
  const questions = problem ? preDiagnosticQuestions[problem] : [];
  const additional = problem ? finalPreDiagnosticQuestion(problem) : null;
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
        description="Sélectionnez ce que vous avez observé. Les réponses marquées d’un * sont obligatoires. En cas de doute, choisissez « Je ne sais pas »."
      />
      <DraftSave draft={draft} step="/questionnaire" sync={confirmed} />
      <BackLink href="/diagnostic" />
      <p className="mb-4 rounded-md bg-sanispa-ice p-4 text-sm leading-6 text-sanispa-navy">
        {problem === "traitement-eau"
          ? "Utilisez les observations et les mesures que vous avez déjà."
          : "Répondez d’après vos observations, sans démontage ni nouvel essai."}
      </p>
      <form
        onSubmit={submit}
        className="space-y-5 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6"
      >
        {(!confirmed || !draft.installationType) && problem ? (
          <SelectField label="Type d’installation" name="installationType" value={draft.installationType} required
            options={[{ value: "interieur", label: "Intérieur" }, { value: "exterieur", label: "Extérieur" }]}
            onChange={value => setDraft(current => ({ ...current, installationType: value as DiagnosticDraft["installationType"] }))} />
        ) : null}
        {questions
          .filter((q) => isQuestionVisible(q, draft.answers, questions))
          .map((q) => (
            <DiagnosticQuestion key={q.id}
                question={q}
                value={draft.answers[q.id]}
                onChange={(value) => {
                  setError("");
                  setDraft((current) =>
                    updateDiagnosticAnswer(current, q.id, value),
                  );
                }}
            />
          ))}
        {additional ? (
          <div className="border-t border-sanispa-line pt-5">
            <DiagnosticQuestion question={additional} value={draft.answers[additional.id]}
              onChange={value => setDraft(current => updateDiagnosticAnswer(current, additional.id, value))} />
          </div>
        ) : null}
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
