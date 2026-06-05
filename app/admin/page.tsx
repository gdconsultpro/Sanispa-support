import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AdminDiagnostic } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { diagnostics, error } = await loadDiagnostics();

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Dashboard admin"
        title="Demandes de pré-diagnostic"
        description="Vue simple des dossiers transmis à SANISPA, avec coordonnées, panne, réponses, photos et paiement."
      />

      {error ? (
        <div className="rounded-md border border-sanispa-line bg-white p-5 text-sm leading-6 text-sanispa-steel">
          <p className="font-bold text-sanispa-navy">Supabase n'est pas encore configuré.</p>
          <p className="mt-2">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {diagnostics.length === 0 && !error ? (
          <div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">Aucune demande enregistrée pour le moment.</div>
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
                <span className="text-sanispa-steel">Paiement : {diagnostic.payment_status ?? "non requis / non payé"}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <section>
                <h3 className="text-sm font-bold text-sanispa-navy">Dossier</h3>
                <dl className="mt-2 grid gap-2 text-sm text-sanispa-steel">
                  <Line label="Type de panne" value={diagnostic.problem_type} />
                  <Line label="Choix client" value={diagnostic.choice ?? "Non renseigné"} />
                  <Line label="Adresse" value={diagnostic.customers?.address ?? "Non renseignée"} />
                  <Line label="Spa" value={`${diagnostic.customers?.spa_brand ?? ""} ${diagnostic.customers?.spa_model ?? ""}`.trim()} />
                </dl>
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
          </article>
        ))}
      </div>
    </AppShell>
  );
}

async function loadDiagnostics(): Promise<{ diagnostics: AdminDiagnostic[]; error: string | null }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("diagnostics")
      .select(`
        id,
        created_at,
        status,
        problem_type,
        choice,
        payment_status,
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
      .order("created_at", { ascending: false });

    if (error) throw error;
    const diagnostics = (data ?? []).map((item) => ({
      ...item,
      customers: Array.isArray(item.customers) ? item.customers[0] ?? null : item.customers
    })) as unknown as AdminDiagnostic[];

    return { diagnostics, error: null };
  } catch (error) {
    return { diagnostics: [], error: error instanceof Error ? error.message : "Erreur de chargement." };
  }
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-sanispa-navy">{label}</dt>
      <dd>{value || "Non renseigné"}</dd>
    </div>
  );
}
