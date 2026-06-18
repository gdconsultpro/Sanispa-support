"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Partner = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string;
};

export default function PartnerHomePage() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPartner() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("Connectez-vous avec un compte partenaire pour accéder à cet espace.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/partner/session", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Accès partenaire refusé.");
        setLoading(false);
        return;
      }

      setPartner(payload.partner);
      setLoading(false);
    }

    loadPartner();
  }, []);

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Espace partenaire"
        title="Portail partenaire SANISPA"
        description="Consultez les demandes techniques disponibles dans vos zones d'intervention."
      />

      {loading ? <PartnerCard>Chargement de votre accès partenaire...</PartnerCard> : null}

      {!loading && error ? (
        <PartnerCard>
          <p className="font-bold text-sanispa-navy">{error}</p>
          <div className="mt-4">
            <ButtonLink href="/partenaire/connexion">Connexion partenaire</ButtonLink>
          </div>
        </PartnerCard>
      ) : null}

      {!loading && partner ? (
        <PartnerCard>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-sanispa-blue">{partner.company_name}</p>
          <h2 className="mt-2 text-2xl font-black text-sanispa-navy">Leads techniques disponibles</h2>
          <p className="mt-2 text-sanispa-steel">
            Les dossiers affichés sont limités aux informations de préqualification. Les coordonnées complètes du client restent masquées.
          </p>
          <div className="mt-5">
            <ButtonLink href="/partenaire/leads">Voir les leads</ButtonLink>
          </div>
        </PartnerCard>
      ) : null}
    </AppShell>
  );
}

function PartnerCard({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">{children}</section>;
}
