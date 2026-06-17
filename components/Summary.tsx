import { getPhotoRequirements, problemTypes, questionSets, remotePlans } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";

export function DiagnosticSummary({ draft }: { draft: DiagnosticDraft }) {
  const problemLabel = problemTypes.find((item) => item.value === draft.problemType)?.label ?? "Non renseigné";
  const questions = draft.problemType ? questionSets[draft.problemType] : [];
  const plan = remotePlans.find((item) => item.id === draft.paymentPlan);
  const photos = getPhotoRequirements(draft.problemType);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Coordonnées client</h2>
        <dl className="grid gap-3 text-sm text-sanispa-steel">
          <SummaryLine label="Nom" value={draft.name} />
          <SummaryLine label="Téléphone" value={draft.phone} />
          <SummaryLine label="Email" value={draft.email} />
          <SummaryLine label="Adresse" value={draft.address || "Non renseignée"} />
          <SummaryLine label="Code postal" value={draft.postalCode} />
          <SummaryLine label="Ville" value={draft.city} />
        </dl>
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Spa</h2>
        <dl className="grid gap-3 text-sm text-sanispa-steel">
          <SummaryLine label="Marque" value={draft.spaBrand} />
          <SummaryLine label="Modèle" value={draft.spaModel || "Non connu"} />
          <SummaryLine label="Année" value={draft.spaYear} />
          <SummaryLine label="Installation" value={draft.installationType} />
          {draft.powerSupply ? <SummaryLine label="Alimentation" value={draft.powerSupply} /> : null}
        </dl>
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Type de panne</h2>
        <p className="font-semibold text-sanispa-navy">{problemLabel}</p>
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Réponses au questionnaire</h2>
        <dl className="grid gap-3 text-sm text-sanispa-steel">
          {questions.map((question) => (
            <SummaryLine key={question.id} label={question.label} value={draft.answers[question.id] || "Non renseigné"} />
          ))}
        </dl>
      </section>

      <section className="rounded-md border border-sanispa-line bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Photos jointes</h2>
        <dl className="grid gap-3 text-sm text-sanispa-steel">
          {photos.map((photo) => (
            <SummaryLine key={photo.id} label={photo.label} value={draft.photos[photo.id] ? "Ajoutée" : "Non ajoutée"} />
          ))}
        </dl>
      </section>

      {draft.choice ? (
        <section className="rounded-md border border-sanispa-line bg-white p-4">
          <h2 className="mb-3 text-lg font-bold">Orientation choisie</h2>
          <p className="text-sm font-semibold text-sanispa-navy">
            {draft.choice === "intervention" ? "Demande technique gratuite" : draft.choice === "devis" ? "Demande de devis" : "Diagnostic Traitement d'Eau IA"}
          </p>
          {plan ? <p className="mt-2 text-sm text-sanispa-steel">{plan.name} - {plan.price} €</p> : null}
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
