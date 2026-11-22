import { photoExceptionValid, serializeAnswers } from "@/lib/diagnostic-answers";
import { getPhotoRequirements, isPhotoRequired, problemTypes } from "@/lib/questions";
import type { DiagnosticDraft } from "@/lib/types";
import { contactFields, contactLabels, missingContactFields, type ContactField } from "@/lib/diagnostic-contact";
import { DiagnosticContactFields } from "./DiagnosticContactFields";

export function DiagnosticSummary({ draft, contactEdit }: {
  draft: DiagnosticDraft;
  contactEdit?: {
    fields: readonly ContactField[];
    expanded: boolean;
    toggle: () => void;
    onChange: (field: ContactField, value: string) => void;
  };
}) {
  const problem = problemTypes.find(item => item.value === draft.problemType)?.label;
  const answers = serializeAnswers(draft);
  const photos = getPhotoRequirements(draft.problemType, draft.photos);
  const photoCount = photos.filter(photo => draft.photos[photo.id]).length;
  const installation = draft.installationType === "exterieur" ? "Extérieur" : draft.installationType === "interieur" ? "Intérieur" : "";
  const spa = [draft.spaBrand, draft.spaModel, draft.spaYear, installation, draft.powerSupply].filter(Boolean).join(" · ");
  const editFields = contactEdit?.expanded ? contactFields : contactEdit?.fields ?? [];
  const shownFields = contactFields.filter(field => !editFields.includes(field) && Boolean(draft[field]?.trim()));

  return <div className="space-y-4">
    <section aria-labelledby="recap-demande" className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5">
      <h2 id="recap-demande" className="break-words text-lg font-bold">{problem || "Votre demande"}</h2>
      {spa ? <p className="mt-1 break-words text-sm text-sanispa-steel">{spa}</p> : null}
      <p className="mt-2 text-sm">{photoCount === 0 ? "Aucune photo jointe" : photoCount === 1 ? "1 photo jointe" : `${photoCount} photos jointes`}</p>
      {answers.length || photos.length ? <details className="mt-3 border-t border-sanispa-line pt-2">
        <summary className="focus-ring w-fit cursor-pointer rounded py-2 text-sm font-bold text-sanispa-blue">Voir les réponses et les photos</summary>
        {answers.length ? <dl className="mt-3 grid gap-3 text-sm">
          {answers.map(answer => <SummaryLine key={answer.question_key} label={answer.question_label} value={answer.answer} />)}
        </dl> : null}
        {photos.length ? <dl className="mt-4 grid gap-3 border-t border-sanispa-line pt-3 text-sm">
          {photos.map(photo => <SummaryLine key={photo.id} label={photo.label} value={draft.photos[photo.id]
            ? "Photo jointe" : isPhotoRequired(photo.id, draft.problemType) ? photoExceptionValid(draft) ? "Non fournie · motif indiqué" : "Photo obligatoire manquante" : "Facultative · non ajoutée"} />)}
        </dl> : null}
      </details> : null}
    </section>

    <section id="coordonnees-declaration" aria-labelledby="contact-demande" className="scroll-mt-4 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5">
      <h2 id="contact-demande" className="text-lg font-bold">Vos coordonnées</h2>
      {contactEdit && missingContactFields(draft).length ? <p className="mt-1 text-sm">Complétez les informations pour que SANISPA puisse vous contacter.</p> : null}
      {shownFields.length ? <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {shownFields.map(field => <SummaryLine key={field} label={contactLabels[field]} value={draft[field]} />)}
      </dl> : null}
      {contactEdit && editFields.length ? <div className="mt-3">
        <DiagnosticContactFields draft={draft} fields={editFields} onChange={contactEdit.onChange} readOnlyEmail />
      </div> : null}
      {contactEdit ? <button type="button" onClick={contactEdit.toggle} aria-expanded={contactEdit.expanded} className="focus-ring mt-2 min-h-11 rounded px-1 text-sm font-bold underline">
        {contactEdit.expanded ? "Réduire les coordonnées" : "Modifier mes coordonnées"}
      </button> : null}
    </section>
  </div>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 break-words">
    <dt className="font-bold text-sanispa-navy">{label}</dt>
    <dd className="text-sanispa-steel">{value}</dd>
  </div>;
}
