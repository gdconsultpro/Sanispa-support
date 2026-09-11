import Link from "next/link";
import { AdminPartnerRelease } from "@/components/AdminPartnerRelease";
import { AdminActions } from "@/components/AdminActions";
import { AdminClientDocuments } from "@/components/AdminClientDocuments";
import { AdminDossierHistory } from "@/components/AdminDossierHistory";
import { AdminNextAction } from "@/components/AdminNextAction";
import { SavActions } from "@/components/SavActions";
import { adminDate, adminProblemDescription } from "@/lib/admin-presentation";
import { choiceLabel, emailStatusLabel, photoLabel, problemLabel, statusLabel } from "@/lib/display-labels";
import type { AdminDossierDetails } from "@/lib/admin-dossier";
import type { AdminDiagnostic } from "@/lib/types";

export function diagnosticPanels(diagnostic: AdminDiagnostic, details?: AdminDossierDetails) {
  const description = adminProblemDescription(diagnostic);
  return {
    diagnostic: <div className="grid min-w-0 gap-6">
      <section>
        <h3 className="text-base font-bold text-sanispa-navy">Coordonnées et spa</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Line label="Client" value={diagnostic.customers?.name}/>
          <Line label="Téléphone" value={diagnostic.customers?.phone}/>
          <Line label="E-mail" value={diagnostic.customers?.email}/>
          <Line label="Adresse" value={diagnostic.customers?.address}/>
          <Line label="Spa" value={`${diagnostic.customers?.spa_brand ?? ""} ${diagnostic.customers?.spa_model ?? ""}`.trim()}/>
          <Line label="Département" value={diagnostic.department}/>
        </dl>
      </section>
      <section className="rounded-lg border border-sanispa-line bg-sanispa-ice p-4">
        <h3 className="font-bold text-sanispa-navy">Problème signalé</h3>
        <p className="mt-1 font-semibold text-sanispa-blue">{problemLabel(diagnostic.problem_type)}</p>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-sanispa-steel">{description || "Les précisions disponibles figurent dans les réponses au questionnaire ci-dessous."}</p>
        <p className="mt-3 text-sm text-sanispa-steel">Souhait du client : {choiceLabel(diagnostic.choice)}</p>
      </section>
      <section>
        <h3 className="font-bold text-sanispa-navy">Réponses au questionnaire</h3>
        {diagnostic.diagnostic_answers.length ? <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {diagnostic.diagnostic_answers.map((answer,index) => <div key={`${diagnostic.id}-${answer.question_key ?? index}`} className="min-w-0 rounded-lg border border-sanispa-line p-3 text-sm">
            <dt className="font-semibold text-sanispa-navy">{answer.question_label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-sanispa-steel">{answer.answer}</dd>
          </div>)}
        </dl> : <p className="mt-2 text-sm text-sanispa-steel">Aucune réponse enregistrée.</p>}
      </section>
      <a href={`/api/admin/diagnostics/${diagnostic.id}/pdf`} className="focus-ring inline-flex min-h-11 items-center justify-center justify-self-start rounded-md border border-sanispa-line bg-white px-4 py-2 text-sm font-bold text-sanispa-navy">Télécharger le résumé PDF</a>
      <details className="rounded-lg border border-sanispa-line p-4">
        <summary className="focus-ring cursor-pointer font-bold text-sanispa-navy">Orientation, paiement et notifications</summary>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Line label="Type de demande" value={statusLabel(diagnostic.request_type)}/>
          <Line label="Paiement client" value={diagnostic.payment_status ? statusLabel(diagnostic.payment_status) : "Aucun paiement enregistré"}/>
          <Line label="E-mail client" value={emailStatusLabel(diagnostic.customer_email_status)}/>
          {diagnostic.customer_email_error ? <Line label="Erreur d’envoi" value={diagnostic.customer_email_error}/> : null}
          <Line label="Destinataire de la diffusion" value={diagnostic.matched_partners?.join(", ") || "Aucun destinataire autorisé"}/>
          <Line label="Partenaire assigné" value={diagnostic.assigned_partner || "Non assigné"}/>
          <Line label="Dossier acheté par un partenaire" value={diagnostic.lead_purchase?.status === "paid" ? "Oui" : "Non"}/>
          <Line label="Date de l’achat partenaire" value={diagnostic.lead_purchase?.paid_at ? adminDate(diagnostic.lead_purchase.paid_at) : "Non acheté"}/>
          <Line label="Paiement du partenaire" value={diagnostic.lead_purchase?.status ? statusLabel(diagnostic.lead_purchase.status) : "Aucun achat"}/>
          <Line label="Référence du paiement partenaire" value={diagnostic.lead_purchase?.stripe_checkout_session_id}/>
        </dl>
      </details>
    </div>,
    documents: <div className="min-w-0">
      <section>
        <h3 className="font-bold text-sanispa-navy">Photos du dossier</h3>
        {diagnostic.diagnostic_photos.some(photo=>photo.public_url) ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {diagnostic.diagnostic_photos.map(photo=>photo.public_url ? <Link key={photo.storage_path} href={photo.public_url} target="_blank" rel="noopener noreferrer" className="focus-ring group min-w-0 rounded-lg border border-sanispa-line p-2">
            <img src={photo.public_url} alt={photoLabel(photo.photo_type)} className="h-32 w-full rounded-md bg-sanispa-ice object-cover"/>
            <span className="mt-2 block text-sm font-semibold text-sanispa-navy">{photoLabel(photo.photo_type)}</span>
            <span className="mt-1 block text-xs text-sanispa-steel">Ouvrir la photo · nouvel onglet</span>
          </Link> : null)}
        </div> : <p className="mt-2 text-sm text-sanispa-steel">Aucune photo disponible pour ce dossier.</p>}
      </section>
      <AdminClientDocuments diagnosticId={diagnostic.id} documents={details?.documents ?? []} error={details?.documentsError}/>
    </div>,
    followup: <div className="grid min-w-0 gap-5">
      {diagnostic.choice === "intervention" && diagnostic.request_type === "TECHNICAL_REQUEST" ? <AdminPartnerRelease diagnosticId={diagnostic.id}/> : null}
      <AdminNextAction diagnosticId={diagnostic.id} initialAction={{text:diagnostic.next_action_text,dueAt:diagnostic.next_action_at,state:diagnostic.next_action_state,version:diagnostic.next_action_version}}/>
      <section><h3 className="font-bold text-sanispa-navy">Statut et notes internes</h3><SavActions id={diagnostic.id} initialStatus={diagnostic.status} initialNotes={diagnostic.internal_notes || ""}/></section>
      <AdminActions diagnosticId={diagnostic.id} archived={Boolean(diagnostic.archived_at)}/>
    </div>,
    history: <AdminDossierHistory activity={details?.activity ?? []} error={details?.historyError}/>,
  };
}

function Line({label,value}:{label:string;value?:string|null}) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-sanispa-steel">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sanispa-navy">{value || "Non renseigné"}</dd></div>;
}
