import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AdminActions } from "@/components/AdminActions";
import { PartnerAdmin } from "@/components/PartnerAdmin";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AdminDiagnostic, PartnerAdminItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ archived?: string; tab?: string }> }) {
  const params = await searchParams;
  const tab = params?.tab === "partners" ? "partners" : "diagnostics";
  const showArchived = params?.archived === "1";
  const [{ diagnostics, error }, { partners, error: partnerError }] = await Promise.all([loadDiagnostics(showArchived), loadPartners()]);

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Dashboard admin"
        title={tab === "partners" ? "Partenaires techniques" : "Demandes SANISPA"}
        description={
          tab === "partners"
            ? "Gestion des partenaires et des départements couverts pour préparer la future diffusion des dossiers."
            : "Vue simple des dossiers clients, avec qualification, département, partenaires concernés, photos, documents et paiement."
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin" className={`rounded-md border px-4 py-2 text-sm font-bold focus-ring ${tab === "diagnostics" ? "border-sanispa-blue bg-white text-sanispa-navy" : "border-sanispa-line text-sanispa-steel"}`}>
          Demandes
        </Link>
        <Link href="/admin?tab=partners" className={`rounded-md border px-4 py-2 text-sm font-bold focus-ring ${tab === "partners" ? "border-sanispa-blue bg-white text-sanispa-navy" : "border-sanispa-line text-sanispa-steel"}`}>
          Partenaires
        </Link>
        {tab === "diagnostics" ? (
          <>
            <Link href="/admin" className={`rounded-md border px-4 py-2 text-sm font-bold focus-ring ${!showArchived ? "border-sanispa-blue bg-white text-sanispa-navy" : "border-sanispa-line text-sanispa-steel"}`}>
              Actives
            </Link>
            <Link href="/admin?archived=1" className={`rounded-md border px-4 py-2 text-sm font-bold focus-ring ${showArchived ? "border-sanispa-blue bg-white text-sanispa-navy" : "border-sanispa-line text-sanispa-steel"}`}>
              Archivées
            </Link>
          </>
        ) : null}
      </div>

      {tab === "partners" ? (
        <>
          {partnerError ? (
            <div className="mb-5 rounded-md border border-sanispa-line bg-white p-5 text-sm leading-6 text-sanispa-steel">
              <p className="font-bold text-sanispa-navy">Tables partenaires non configurées.</p>
              <p className="mt-2">{partnerError}</p>
            </div>
          ) : null}
          <PartnerAdmin initialPartners={partners} />
        </>
      ) : (
        <>
          {error ? (
            <div className="rounded-md border border-sanispa-line bg-white p-5 text-sm leading-6 text-sanispa-steel">
              <p className="font-bold text-sanispa-navy">Supabase n'est pas encore configuré.</p>
              <p className="mt-2">{error}</p>
            </div>
          ) : null}

          <div className="grid gap-4">
            {diagnostics.length === 0 && !error ? (
              <div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">
                {showArchived ? "Aucune demande archivée." : "Aucune demande active enregistrée pour le moment."}
              </div>
            ) : null}

            {diagnostics.map((diagnostic) => (
              <article key={diagnostic.id} className="rounded-md border border-sanispa-line bg-white p-4 shadow-soft">
                <div className="flex flex-col gap-3 border-b border-sanispa-line pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-sanispa-blue">{new Date(diagnostic.created_at).toLocaleString("fr-FR")}</p>
                    <h2 className="mt-2 text-xl font-bold text-sanispa-navy">{diagnostic.customers?.name ?? "Client inconnu"}</h2>
                    <p className="mt-1 text-sm text-sanispa-steel">{diagnostic.customers?.phone} · {diagnostic.customers?.email}</p>
                  </div>
                  <div className="grid gap-2 text-sm sm:text-right">
                    <span className="rounded-md bg-sanispa-ice px-3 py-2 font-bold text-sanispa-navy">{diagnostic.status}</span>
                    <span className="text-sanispa-steel">Type : {diagnostic.request_type ?? "Non renseigné"}</span>
                    <span className="text-sanispa-steel">Paiement : {diagnostic.payment_status ?? "non requis / non payé"}</span>
                    <span className="text-sanispa-steel">Email client : {diagnostic.customer_email_status ?? "non suivi"}</span>
                    {diagnostic.customer_email_error ? (
                      <span className="rounded-md bg-red-50 px-3 py-2 text-left text-red-700 sm:text-right">Erreur email client : {diagnostic.customer_email_error}</span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <section>
                    <h3 className="text-sm font-bold text-sanispa-navy">Dossier</h3>
                    <dl className="mt-2 grid gap-2 text-sm text-sanispa-steel">
                      <Line label="Type de panne" value={diagnostic.problem_type} />
                      <Line label="Choix client" value={diagnostic.choice ?? "Non renseigné"} />
                      <Line label="Département" value={diagnostic.department ?? "Non calculé"} />
                      <Line label="Partenaires concernés" value={diagnostic.matched_partners?.join(", ") || "Aucun partenaire correspondant"} />
                      <Line label="Lead acheté" value={diagnostic.lead_purchase?.status === "paid" ? "Oui" : "Non"} />
                      <Line label="Partenaire assigné" value={diagnostic.assigned_partner ?? "Non assigné"} />
                      <Line label="Date achat lead" value={diagnostic.lead_purchase?.paid_at ? new Date(diagnostic.lead_purchase.paid_at).toLocaleString("fr-FR") : "Non acheté"} />
                      <Line label="Statut achat lead" value={diagnostic.lead_purchase?.status ?? "Aucun achat"} />
                      <Line label="Stripe Checkout lead" value={diagnostic.lead_purchase?.stripe_checkout_session_id ?? "Non renseigné"} />
                      <Line label="Adresse" value={diagnostic.customers?.address ?? "Non renseignée"} />
                      <Line label="Spa" value={`${diagnostic.customers?.spa_brand ?? ""} ${diagnostic.customers?.spa_model ?? ""}`.trim()} />
                    </dl>
                    <a href={`/api/client/documents/${diagnostic.id}/pdf`} className="mt-3 inline-flex rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy focus-ring">
                      Télécharger résumé PDF
                    </a>
                  </section>

                  <section>
                    <h3 className="text-sm font-bold text-sanispa-navy">Réponses</h3>
                    <div className="mt-2 grid max-h-64 gap-2 overflow-auto text-sm text-sanispa-steel">
                      {diagnostic.diagnostic_answers.map((answer) => (
                        <div key={`${diagnostic.id}-${answer.question_label}`} className="rounded-md bg-sanispa-ice p-3">
                          <p className="font-bold text-sanispa-navy">{answer.question_label}</p>
                          <p className="mt-1">{answer.answer}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-bold text-sanispa-navy">Photos</h3>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {diagnostic.diagnostic_photos.map((photo) =>
                        photo.public_url ? (
                          <Link key={photo.storage_path} href={photo.public_url} target="_blank" className="group">
                            <img src={photo.public_url} alt={photo.photo_type} className="h-28 w-full rounded-md object-cover" />
                            <span className="mt-1 block text-xs font-semibold text-sanispa-steel group-hover:text-sanispa-blue">{photo.photo_type}</span>
                          </Link>
                        ) : null
                      )}
                    </div>
                  </section>
                </div>

                <AdminActions diagnosticId={diagnostic.id} archived={Boolean(diagnostic.archived_at)} />
              </article>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

async function loadDiagnostics(showArchived: boolean): Promise<{ diagnostics: AdminDiagnostic[]; error: string | null }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("diagnostics")
      .select(`
        id,
        created_at,
        status,
        request_type,
        department,
        matched_partner_ids,
        assigned_partner_id,
        assigned_at,
        problem_type,
        choice,
        payment_status,
        customer_email_status,
        customer_email_error,
        archived_at,
        customers (
          name,
          phone,
          email,
          address,
          spa_brand,
          spa_model
        ),
        diagnostic_answers (
          question_label,
          answer
        ),
        diagnostic_photos (
          photo_type,
          storage_path,
          public_url
        )
      `)
      .filter("archived_at", showArchived ? "not.is" : "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const partners = await loadPartnerNameMap(supabase);
    const leadPurchases = await loadLeadPurchaseMap(supabase);
    const diagnostics = (data ?? []).map((item) => ({
      ...item,
      customers: Array.isArray(item.customers) ? item.customers[0] ?? null : item.customers,
      matched_partners: (item.matched_partner_ids ?? []).map((id: string) => partners.get(id)).filter(Boolean),
      assigned_partner: item.assigned_partner_id ? partners.get(item.assigned_partner_id) ?? item.assigned_partner_id : null,
      lead_purchase: leadPurchases.get(item.id) ?? null
    })) as unknown as AdminDiagnostic[];

    return { diagnostics, error: null };
  } catch (error) {
    return { diagnostics: [], error: error instanceof Error ? error.message : "Erreur de chargement." };
  }
}

async function loadPartners(): Promise<{ partners: PartnerAdminItem[]; error: string | null }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("partners")
      .select("*, partner_departments(department)")
      .order("company_name", { ascending: true });

    if (error) throw error;

    const partners = (data ?? []).map((partner) => ({
      ...partner,
      departments: (partner.partner_departments ?? []).map((row: { department: string }) => row.department).sort()
    })) as PartnerAdminItem[];

    return { partners, error: null };
  } catch (error) {
    return { partners: [], error: error instanceof Error ? error.message : "Erreur de chargement des partenaires." };
  }
}

async function loadPartnerNameMap(supabase: any) {
  const { data } = await supabase.from("partners").select("id, company_name");
  return new Map((data ?? []).map((partner: { id: string; company_name: string }) => [partner.id, partner.company_name]));
}

async function loadLeadPurchaseMap(supabase: any) {
  const { data } = await supabase
    .from("lead_purchases")
    .select("request_id, status, paid_at, stripe_checkout_session_id")
    .order("created_at", { ascending: false });

  const purchases = new Map();
  for (const purchase of data ?? []) {
    if (!purchases.has(purchase.request_id) || purchase.status === "paid") {
      purchases.set(purchase.request_id, purchase);
    }
  }

  return purchases;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-sanispa-navy">{label}</dt>
      <dd>{value || "Non renseigné"}</dd>
    </div>
  );
}
