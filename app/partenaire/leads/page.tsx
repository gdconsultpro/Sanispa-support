"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
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

export default function PartnerLeadsPage() {
  const [leads, setLeads] = useState<PartnerLead[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLeads() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("Connectez-vous avec un compte partenaire pour consulter les leads.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/partner/leads", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Chargement impossible.");
        setLoading(false);
        return;
      }

      setLeads(payload.leads ?? []);
      setLoading(false);
    }

    loadLeads();
  }, []);

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Espace partenaire"
        title="Leads techniques"
        description="Aperçu limité des demandes correspondant à vos départements."
      />

      {loading ? <InfoCard>Chargement des demandes disponibles...</InfoCard> : null}

      {!loading && error ? (
        <InfoCard>
          <p className="font-bold text-sanispa-navy">{error}</p>
          <div className="mt-4">
            <ButtonLink href="/partenaire/connexion">Connexion partenaire</ButtonLink>
          </div>
        </InfoCard>
      ) : null}

      {!loading && !error && leads.length === 0 ? <InfoCard>Aucun lead disponible pour vos secteurs pour le moment.</InfoCard> : null}

      {!loading && !error && leads.length ? (
        <div className="grid gap-4">
          {leads.map((lead) => (
            <Link
              key={lead.id}
              href={`/partenaire/leads/${lead.id}`}
              className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft transition hover:border-sanispa-blue focus-ring"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-sanispa-blue">{lead.problemType}</p>
                  <h2 className="mt-2 text-2xl font-black text-sanispa-navy">
                    {lead.postalCode} {lead.city}
                  </h2>
                </div>
                <p className="text-sm font-semibold text-sanispa-steel">{formatDate(lead.createdAt)}</p>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-sanispa-steel md:grid-cols-3">
                <span>Département : {lead.department ?? "Non renseigné"}</span>
                <span>Marque : {lead.spaBrand || "Non renseignée"}</span>
                <span>Modèle : {lead.spaModel || "Non renseigné"}</span>
              </div>
              {lead.description ? <p className="mt-4 text-sm text-sanispa-steel">{lead.description}</p> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </AppShell>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel shadow-soft">{children}</section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
