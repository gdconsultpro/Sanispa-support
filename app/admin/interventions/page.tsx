import { dossierReference } from "@/lib/dossier-reference";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { administrator } from "@/lib/admin-auth";
import { AppShell } from "@/components/AppShell";
import { AdminActions } from "@/components/AdminActions";
import { adminDossierPath } from "@/lib/admin-navigation";
import { adminInterventionLabels, adminInterventionState, interventionSummaryFields, type AdminInterventionSummary } from "@/lib/admin-intervention-summary";
import { adminDate } from "@/lib/admin-presentation";

export const dynamic = "force-dynamic";
type Intervention = AdminInterventionSummary & {
  id: string;
  public_reference: string | null;
  partner_released_at: string | null;
  partner_received_at: string | null;
  intervened_partner_id: string | null;
  customers: { name: string } | null;
  partner: { company_name: string } | null;
};

const groups = [
  { id: "proposees", title: "Propositions à prendre en charge", states: [] },
  { id: "planning", title: "Rendez-vous à venir", states: [] },
  { id: "a-traiter", title: "À traiter", states: ["contact", "report", "invoice", "recorded"] },
  { id: "attente", title: "Suivis et validations en cours", states: ["review", "quote"] },
  { id: "cloture", title: "Interventions clôturées", states: ["closed"] },
];

export default async function AdminInterventionsPage() {
  let context;
  try { context = await administrator(await headers()); } catch { redirect("/admin/connexion"); }
  const { supabase } = context;
  const [interventions, exports, metrics] = await Promise.all([
    supabase.from("diagnostics")
      .select("id,public_reference,status,assigned_partner_id,partner_kept_at,partner_released_at,partner_received_at,intervened_partner_id,customers(name),partner:partners!diagnostics_assigned_partner_id_fkey(company_name)," + interventionSummaryFields)
      .is("archived_at", null).or("assigned_partner_id.not.is.null,partner_kept_at.not.is.null,intervened_at.not.is.null,partner_released_at.not.is.null")
      .eq("invoices.document_type", "Facture d’intervention").in("invoices.issued_by", ["partner", "sanispa"])
      .order("created_at", { ascending: false }),
    supabase.from("synchroteam_exports")
      .select("diagnostics!inner(public_reference),diagnostic_id,state")
      .neq("state", "cancelled")
      .not("diagnostics.partner_kept_at", "is", null)
      .is("diagnostics.partner_released_at", null)
      .is("diagnostics.assigned_partner_id", null)
      .is("diagnostics.archived_at", null)
      .order("created_at", { ascending: false }).limit(100),
    supabase.rpc("partner_dispatch_totals").single<{ sent: number; completed: number }>(),
  ]);
  const now = Date.now();
  const items = (interventions.data || []) as unknown as Intervention[];
  const buckets = groups.map(group => {
    const rows = items.filter(item => {
      const state = adminInterventionState(item, now);
      const proposal = Boolean(item.partner_released_at && !item.assigned_partner_id && !item.intervened_at && state !== "closed");
      if (group.id === "proposees") return proposal;
      if (proposal) return false;
      return group.id === "planning"
        ? state !== "closed" && item.partner_appointments && Date.parse(item.partner_appointments.ends_at) > now
        : group.states.includes(state);
    });
    if (group.id === "planning") rows.sort((a, b) => Date.parse(a.partner_appointments!.starts_at) - Date.parse(b.partner_appointments!.starts_at));
    return { ...group, rows };
  });

  return <AppShell compact>
    <nav className="flex flex-wrap gap-4 text-sm font-bold underline" aria-label="Administration">
      <Link href="/admin">Demandes</Link><Link href="/admin?tab=partners">Partenaires</Link><Link href="/admin?archived=1">Archives</Link>
    </nav>
    <h1 className="mt-4 text-3xl font-bold">Suivi des interventions</h1>
    <p className="mt-2 text-sm">Retrouvez le planning et ouvrez le dossier pour voir ce qui est attendu.</p>
    {metrics.error || !metrics.data ? <p className="mt-3 text-sm" role="status">Indicateurs partenaires temporairement indisponibles.</p>
      : <dl className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Résultats des dossiers transmis aux partenaires">
        <div className="rounded-xl border border-sanispa-line bg-white p-3">
          <dt className="text-sm font-semibold">Dossiers envoyés aux partenaires</dt><dd className="text-2xl font-bold">{metrics.data.sent}</dd>
        </div>
        <div className="rounded-xl border border-sanispa-line bg-white p-3">
          <dt className="text-sm font-semibold">Dossiers avec intervention réalisée</dt><dd className="text-2xl font-bold">{metrics.data.completed}</dd>
        </div>
      </dl>}
    {interventions.error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">Les interventions n’ont pas pu être chargées. Actualisez la page pour réessayer.</p>
      : <nav className="mt-5 flex flex-wrap gap-2 text-sm" aria-label="Rubriques des interventions">
        {buckets.map(group => <a key={group.id} href={"#" + group.id} className="rounded-lg border border-sanispa-line bg-white px-3 py-2 font-bold">{group.title} ({group.rows.length})</a>)}
      </nav>}
    {!interventions.error ? buckets.map(group => <section key={group.id} id={group.id} aria-labelledby={"interventions-" + group.id}
      className="mt-5 scroll-mt-4 rounded-xl border border-sanispa-line bg-white p-4 sm:p-5">
      <h2 id={"interventions-" + group.id} className="text-xl font-bold">{group.title}</h2>
      {group.rows.length ? <ul className="mt-2 divide-y divide-sanispa-line">{group.rows.map(item => <li key={item.id}
        className="grid min-w-0 gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,1.25fr)] sm:items-center">
        <div className="min-w-0">
          <p className="break-words font-bold">{item.customers?.name || "Client"} · {item.public_reference || "Référence en cours"}</p>
          <p>{item.partner?.company_name || (item.partner_kept_at ? "SANISPA" : "Intervenant à confirmer")}</p>
        </div>
        <div>
          <p className="font-semibold">{group.id === "proposees" ? item.partner_received_at ? "Réception confirmée" : "Réception attendue"
            : adminInterventionLabels[adminInterventionState(item, now)]}</p>
          {item.partner_appointments ? <p>{adminDate(item.partner_appointments.starts_at)}</p> : null}
          {item.partner_released_at && item.intervened_at && item.intervened_partner_id ? <p className="font-semibold text-emerald-800">Intervention réalisée le {adminDate(item.intervened_at)}</p> : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-2 sm:justify-end">
          <Link className="focus-ring inline-flex min-h-11 items-center font-bold text-sanispa-blue underline" href={adminDossierPath(item.id, "followup")}>Ouvrir le dossier →</Link>
          <AdminActions diagnosticId={item.id} intervention />
        </div>
      </li>)}</ul> : <p className="mt-2 text-sm text-sanispa-steel">Aucun dossier dans cette rubrique.</p>}
    </section>) : null}
    <details className="mt-5 rounded-xl border border-sanispa-line bg-white p-4">
      <summary className="cursor-pointer text-lg font-bold">Préparations Synchroteam</summary>
      <p className="mt-2 text-sm">Seuls les dossiers conservés chez SANISPA sont préparés ici. Aucun envoi automatique.</p>
      {exports.error ? <p role="alert" className="mt-3 text-red-800">Les préparations n’ont pas pu être chargées.</p>
        : exports.data?.length ? <ul className="mt-3 grid gap-2 text-sm">
          {exports.data.map(row => <li key={row.diagnostic_id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 py-1">
            <div>
              <Link className="font-bold underline" href={adminDossierPath(row.diagnostic_id, "followup")}>Dossier {dossierReference(row.diagnostics)}</Link>
              {" · "}{row.state === "sent" ? "Transmis" : row.state === "review" ? "À vérifier" : "Préparation disponible"}
              {" · "}<a className="underline" href={"/api/admin/diagnostics/" + row.diagnostic_id + "/synchroteam-draft"}>Télécharger la préparation</a>
            </div>
            <AdminActions diagnosticId={row.diagnostic_id} intervention />
          </li>)}
        </ul> : <p className="mt-3 text-sm">Aucune préparation disponible.</p>}
    </details>
  </AppShell>;
}
