"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field, TextAreaField } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { problemTypes, questionSets } from "@/lib/questions";
import { DiagnosticDraft, Question } from "@/lib/types";
import { emptyDraft, readDraft, writeDraft } from "@/lib/storage";

export default function QuestionnairePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = readDraft();
    setDraft(stored);
    if (!stored.problemType) router.push("/diagnostic");
  }, [router]);

  const questions = useMemo(() => (draft.problemType ? questionSets[draft.problemType] : []), [draft.problemType]);
  const problemLabel = problemTypes.find((item) => item.value === draft.problemType)?.label ?? "";

  function isVisible(question: Question) {
    if (!question.showWhen) return true;
    return draft.answers[question.showWhen.questionId] === question.showWhen.equals;
  }

  function updateAnswer(id: string, value: string) {
    setDraft((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [id]: value
      }
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = questions.some((question) => question.required && isVisible(question) && !draft.answers[question.id]);
    if (missing) {
      setError("Veuillez répondre aux questions obligatoires avant de continuer.");
      return;
    }
    writeDraft(draft);
    router.push("/upload");
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Étape 2"
        title={`Questionnaire ${problemLabel}`}
        description="Répondez aux questions visibles. Elles sont adaptées au type de panne sélectionné."
      />

      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6">
        {questions.map((question) => {
          if (!isVisible(question)) return null;
          if (question.type === "radio") {
            return (
              <fieldset key={question.id} className="rounded-md border border-sanispa-line p-4">
                <legend className="px-1 text-sm font-bold text-sanispa-navy">
                  {question.label}
                  {question.required ? <span className="text-sanispa-blue"> *</span> : null}
                </legend>
                <div className="mt-3 grid gap-2">
                  {question.options?.map((option) => (
                    <label key={option} className="flex min-h-11 items-center gap-3 rounded-md bg-sanispa-ice px-3 py-2 text-sm font-semibold text-sanispa-navy">
                      <input
                        type="radio"
                        name={question.id}
                        checked={draft.answers[question.id] === option}
                        onChange={() => updateAnswer(question.id, option)}
                        required={question.required}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          if (question.type === "textarea") {
            return (
              <TextAreaField
                key={question.id}
                label={question.label}
                name={question.id}
                value={draft.answers[question.id] ?? ""}
                onChange={(value) => updateAnswer(question.id, value)}
                required={question.required}
              />
            );
          }
          return (
            <Field
              key={question.id}
              label={question.label}
              name={question.id}
              value={draft.answers[question.id] ?? ""}
              onChange={(value) => updateAnswer(question.id, value)}
              required={question.required}
              type={question.type}
            />
          );
        })}

        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full sm:w-auto">Continuer vers les photos</Button>
      </form>
    </AppShell>
  );
}
