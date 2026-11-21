import { adminInterventionLabels, adminInterventionOutcomes, adminInterventionState, type AdminInterventionSummary } from "@/lib/admin-intervention-summary";
import { adminDate } from "@/lib/admin-presentation";

export function AdminInterventionOverview({ dossier, partnerName }: { dossier: AdminInterventionSummary; partnerName?: string | null }) {
  const reports = [...(dossier.intervention_reports || [])].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const invoices = dossier.invoices || [];
  const appointment = dossier.partner_appointments;
  const summary = adminInterventionLabels[adminInterventionState(dossier)];
  return (
    <section className="rounded-xl border border-sanispa-line bg-sanispa-ice p-4">
      <h3 className="font-bold">Intervention et clôture</h3>
      <p className="mt-2 font-semibold">{summary}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-bold">Intervenant</dt><dd>{partnerName || (dossier.partner_kept_at ? "SANISPA" : "À confirmer")}</dd></div>
        <div><dt className="font-bold">Rendez-vous</dt><dd>{appointment ? adminDate(appointment.starts_at) + " → " + adminDate(appointment.ends_at) : "À renseigner"}</dd></div>
        {dossier.intervened_at ? <div><dt className="font-bold">Visite effectuée</dt><dd>{adminDate(dossier.intervened_at)}</dd></div> : null}
        <div><dt className="font-bold">Facture d’intervention</dt><dd>{invoices.length ? <ul>{invoices.map(invoice => <li key={invoice.id}>
          <a className="break-words font-bold text-sanispa-blue underline" href={"/api/admin/documents/" + invoice.id}>{invoice.file_name || "Télécharger la facture"}</a>
        </li>)}</ul> : "À déposer pour clôturer une réparation"}</dd></div>
      </dl>
      <div className="mt-4 grid gap-3">
        {reports.length ? reports.map((report, index) => (
          <details key={report.id} open={index === 0} className="rounded-lg border border-sanispa-line bg-white p-3 text-sm">
            <summary className="cursor-pointer font-bold">Compte rendu du {adminDate(report.performed_at)}</summary>
            <p className="mt-2 font-bold">{report.client_validated_at
              ? (adminInterventionOutcomes[report.client_outcome || ""] || "Validé par le client") + " · " + adminDate(report.client_validated_at)
              : "Validation du client en attente"}</p>
            {report.findings ? <p className="mt-2 whitespace-pre-wrap break-words"><strong>Constats</strong> · {report.findings}</p> : null}
            {report.actions ? <p className="mt-2 whitespace-pre-wrap break-words"><strong>Travaux</strong> · {report.actions}</p> : null}
            {report.next_steps ? <p className="mt-2 whitespace-pre-wrap break-words"><strong>Suite</strong> · {report.next_steps}</p> : null}
            {report.client_validated_at && report.responsiveness != null ? <p className="mt-2">Réactivité {report.responsiveness}/5 · Professionnalisme {report.professionalism}/5 · Tarif {report.pricing}/5</p> : null}
          </details>
        )) : <p className="text-sm">Aucun compte rendu déposé.</p>}
      </div>
    </section>
  );
}
