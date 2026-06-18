"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type PartnerLead = {
  id: string;
  createdAt: string;
  problemType: string;
  department: string | null;
  postalCode: string;
  city: string;
  spaBrand: string | null;
  spaModel: string | null;
  description: string | null;
};

export default function PartnerLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<PartnerLead | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLead() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("Connectez-vous avec un compte partenaire pour consulter ce lead.");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/partner/leads/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Lead introuvable.");
        setLoading(false);
        return;
      }

      setLead(payload.lead);
      setLoading(false);
    }

    if (params.id) loadLead();
  }, [params.id]);

  return (
    <AppShell compact>
      <div className="mb-5">
        <Link href="/partenaire/leads" className="text-sm font-bold text-sanispa-blue">
          ← Retour aux leads
        </Link>
      </div>

      <StepHeader
        eyebrow="Aperçu limité"
        title="Détail du lead technique"
        description="Les coordonnées et les éléments complets du dossier seront disponibles lors d'une prochaine étape de déblocage."
      />

      {loading ? <DetailCard>Chargement du lead...</DetailCard> : null}
      {!loading && error ? <DetailCard>{error}</DetailCard> : null}

      {!loading && lead ? (
        <DetailCard>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-sanispa-blue">{lead.problemType}</p>
          <h2 className="mt-2 text-3xl font-black text-sanispa-navy">
            {lead.postalCode} {lead.city}
          </h2>

          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            <PreviewItem label="Département" value={lead.department ?? "Non renseigné"} />
            <PreviewItem label="Date de demande" value={formatDate(lead.createdAt)} />
            <PreviewItem label="Marque du spa" value={lead.spaBrand || "Non renseignée"} />
            <PreviewItem label="Modèle du spa" value={lead.spaModel || "Non renseigné"} />
          </dl>

          {lead.description ? (
            <div className="mt-6 rounded-md bg-sanispa-ice p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-sanispa-blue">Description générale</h3>
              <p className="mt-2 text-sanispa-steel">{lead.description}</p>
            </div>
          ) : null}

          <button
            type="button"
            disabled
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-sanispa-steel/30 px-5 py-3 text-sm font-bold text-sanispa-navy"
          >
            Déblocage bientôt disponible - 10 € TTC
          </button>
        </DetailCard>
      ) : null}
    </AppShell>
  );
}

function DetailCard({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel shadow-soft">{children}</section>;
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-black uppercase tracking-[0.14em] text-sanispa-blue">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-sanispa-navy">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
