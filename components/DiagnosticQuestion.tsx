"use client";
import { Field, TextAreaField } from "./Field";
import { answerText, toggleAnswer } from "@/lib/diagnostic-answers";
import type { AnswerValue, Question } from "@/lib/types";
export function DiagnosticQuestion({ question: q, value, onChange }: { question: Question; value?: AnswerValue; onChange: (value: AnswerValue) => void }) {
  const helpId = `${q.id}-help`;
  if (q.legacyOnly) return <p className="rounded-md bg-sanispa-ice p-3 text-sm"><strong>{q.label} :</strong> {answerText(value)}</p>;
  return <div className="space-y-2">
    {q.type === "radio" || q.type === "checkbox" ? <fieldset aria-describedby={q.help ? helpId : undefined} className="rounded-md border border-sanispa-line p-4">
      <legend className="px-1 text-sm font-bold text-sanispa-navy">{q.label}{q.required ? " *" : ""}</legend>
      {q.type === "checkbox" ? <p className="mb-2 text-xs text-sanispa-steel">Plusieurs réponses possibles.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options?.map(option => <label key={option} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md bg-sanispa-ice px-3 py-3 text-sm text-sanispa-navy">
          <input className="focus-ring mt-0.5 shrink-0" type={q.type} name={q.id} checked={Array.isArray(value) ? value.includes(option) : value === option} onChange={() => onChange(q.type === "checkbox" ? toggleAnswer(value, option) : option)} required={q.type === "radio" && q.required} />
          <span>{option}</span>
        </label>)}
      </div>
    </fieldset> : q.type === "number" ? <fieldset className="rounded-md border border-sanispa-line p-4" aria-describedby={q.help ? helpId : undefined}>
      <legend className="px-1 text-sm font-bold text-sanispa-navy">{q.label}{q.required ? " *" : ""}</legend>
      <label className="block text-sm">Valeur
        <input className="focus-ring mt-2 min-h-12 w-full rounded-md border border-sanispa-line px-4 py-3 text-base" name={q.id} type="text" inputMode="decimal" value={q.unknownOptions?.includes(answerText(value)) ? "" : answerText(value)} disabled={q.unknownOptions?.includes(answerText(value))} onChange={e => onChange(e.target.value)} maxLength={30} />
      </label>
      <label className="mt-3 block text-sm">Si la valeur n’est pas disponible
        <select className="focus-ring mt-2 min-h-12 w-full rounded-md border border-sanispa-line bg-white px-3 text-base" value={q.unknownOptions?.includes(answerText(value)) ? answerText(value) : ""} onChange={e => onChange(e.target.value)}>
          <option value="">Saisir une valeur ou laisser vide</option>{q.unknownOptions?.map(option => <option key={option}>{option}</option>)}
        </select>
      </label>
    </fieldset> : q.type === "textarea" ? <TextAreaField label={q.label} name={q.id} value={answerText(value)} onChange={onChange} required={q.required} /> : <Field label={q.label} name={q.id} value={answerText(value)} onChange={onChange} required={q.required} maxLength={3000} />}
    {q.help ? <p id={helpId} className="text-sm leading-6 text-sanispa-steel">{q.help}</p> : null}
  </div>;
}
