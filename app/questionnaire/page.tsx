"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftSave } from "@/components/DraftSave";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { DiagnosticQuestion } from "@/components/DiagnosticQuestion";
import { StepHeader } from "@/components/StepHeader";
import { diagnosticSafety, problemTypes, questionSets } from "@/lib/questions";
import { isQuestionVisible, updateDiagnosticAnswer, validateAnswers } from "@/lib/diagnostic-answers";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft, saveDraft } from "@/lib/storage";
export default function QuestionnairePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const stored = readDraft();
    setDraft(stored);
    if (!stored.problemType) router.push("/diagnostic");
  }, [router]);
  const questions = draft.problemType ? questionSets[draft.problemType] : [];
  const problemLabel = problemTypes.find(item => item.value === draft.problemType)?.label ?? "";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    try {
      validateAnswers(draft, false);
      setSaving(true);
      await saveDraft(draft, "/upload");
      router.push("/upload");
    } catch (e) { setError(e instanceof Error ? e.message : "Sauvegarde impossible. Réessayez."); }
    finally { setSaving(false); }
  }
  return <AppShell compact>
    <StepHeader eyebrow="Étape 2" title={`Questionnaire ${problemLabel}`} description="Décrivez les faits observés. Seules les réponses marquées d’un * sont obligatoires. Les autres informations sont facultatives ; vous pouvez répondre « Je ne sais pas »." />
    <DraftSave draft={draft} step="/questionnaire" />
    <BackLink href="/diagnostic" />
    <p className="mb-4 rounded-md bg-sanispa-ice p-4 text-sm leading-6 text-sanispa-navy">{draft.problemType === "traitement-eau" ? "Recopiez seulement les mesures déjà disponibles et les produits déjà utilisés. Ne mélangez pas les traitements pour compléter ce formulaire." : diagnosticSafety}</p>
    <form onSubmit={submit} className="space-y-5 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6">
      {questions.filter(q => isQuestionVisible(q, draft.answers, questions)).map(q => <div key={q.id} className="space-y-4">
        {q.section ? <h2 className="border-b border-sanispa-line pb-2 text-lg font-bold text-sanispa-navy">{q.section}</h2> : null}
        <DiagnosticQuestion question={q} value={draft.answers[q.id]} onChange={value => { setError(""); setDraft(current => updateDiagnosticAnswer(current, q.id, value)); }} />
      </div>)}
      {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <Button disabled={saving} type="submit" className="w-full sm:w-auto">{saving ? "Sauvegarde en cours…" : "Continuer vers les photos"}</Button>
    </form>
  </AppShell>;
}
