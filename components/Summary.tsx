import { paymentsPaused } from "@/lib/commercial-mode";
import { photoExceptionValid, serializeAnswers } from "@/lib/diagnostic-answers";
import { getPhotoRequirements, isPhotoRequired, problemTypes, remotePlans } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
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
  const problemLabel = problemTypes.find((item) => item.value === draft.problemType)?.label ?? "Non renseigné";
  const answers = serializeAnswers(draft);
  const plan = remotePlans.find((item) => item.id === draft.paymentPlan);
  const photos = getPhotoRequirements(draft.problemType, draft.photos);
  const editFields = contactEdit?.expanded ? contactFields : contactEdit?.fields ?? [];
  const shownFields = contactFields.filter(field => !editFields.includes(field) && (contactEdit ? Boolean(draft[field]) : true));

  return (
    <div className="space-y-4">
      <section id="coordonnees-declaration" className="scroll-mt-4 rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Coordonnées pour cette demande</h2>
        {contactEdit && missingContactFields(draft).length ? <p className="mb-3 text-sm">Complétez les coordonnées manquantes pour que SANISPA puisse vous contacter.</p> : null}
        {shownFields.length ? <dl className="grid gap-3 text-sm text-sanispa-steel">
          {shownFields.map(field => <SummaryLine key={field} label={contactLabels[field]} value={draft[field]} />)}
        </dl> : null}
        {contactEdit && editFields.length ? <div className="mt-4">
          <DiagnosticContactFields draft={draft} fields={editFields} onChange={contactEdit.onChange} readOnlyEmail />
        </div> : null}
        {contactEdit ? <button type="button" onClick={contactEdit.toggle} aria-expanded={contactEdit.expanded} className="focus-ring mt-3 min-h-11 rounded px-1 text-sm font-bold underline">
          {contactEdit.expanded ? "Réduire les coordonnées" : "Modifier mes coordonnées"}
        </button> : null}
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Spa</h2>
        <dl className="grid gap-3 text-sm text-sanispa-steel">
          <SummaryLine label="Marque" value={draft.spaBrand} />
          <SummaryLine label="Modèle" value={draft.spaModel || "Non connu"} />
          <SummaryLine label="Année" value={draft.spaYear || "Non renseignée"} />
          <SummaryLine label="Installation" value={draft.installationType === "exterieur" ? "Extérieur" : draft.installationType === "interieur" ? "Intérieur" : "Non renseignée"} />
          {draft.powerSupply ? <SummaryLine label="Alimentation" value={draft.powerSupply} /> : null}
        </dl>
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">{draft.problemType === "demenagement" ? "Motif de la demande" : "Type de panne"}</h2>
        <p className="font-semibold text-sanispa-navy">{problemLabel}</p>
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Réponses au questionnaire</h2>
        <dl className="grid gap-3 text-sm text-sanispa-steel">
          {answers.map(answer => <SummaryLine key={answer.question_key} label={answer.question_label} value={answer.answer} />)}
          {!answers.length ? <p>Aucune observation renseignée.</p> : null}
        </dl>
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Photos jointes</h2>
        <dl className="grid gap-3 text-sm text-sanispa-steel">
          {photos.map((photo) => (
            <SummaryLine key={photo.id} label={photo.label} value={draft.photos[photo.id] ? "Photo ajoutée à votre saisie" : isPhotoRequired(photo.id, draft.problemType) ? photoExceptionValid(draft) ? "Photo non fournie : motif indiqué dans les réponses" : "Photo obligatoire manquante" : "Non ajoutée (facultative)"} />
          ))}
        </dl>
      </section>

      {draft.choice ? (
        <section className="rounded-md border border-sanispa-line bg-white p-4">
          <h2 className="mb-3 text-lg font-bold">Orientation choisie</h2>
          <p className="text-sm font-semibold text-sanispa-navy">
            {draft.choice === "intervention" ? "Demande d'intervention" : draft.choice === "devis" ? "Demande de devis" : "Diagnostic de traitement d'eau IA"}
          </p>
          {plan ? <p className="mt-2 text-sm text-sanispa-steel">{plan.name} — {paymentsPaused() ? "Gratuit" : `${plan.price.toLocaleString("fr-FR")} € TTC${plan.id === "water" ? " / mois" : ""}`}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-sanispa-line pb-3 last:border-0 last:pb-0">
      <dt className="font-bold text-sanispa-navy">{label}</dt>
      <dd>{value || "Non renseigné"}</dd>
    </div>
  );
}
