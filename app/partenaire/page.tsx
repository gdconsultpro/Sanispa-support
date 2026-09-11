"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
import { StepHeader } from "@/components/StepHeader";
import { loadPartnerSession, partnerToken, partnerAuthError } from "@/lib/partner-browser";
import { partnerPasswordPath } from "@/lib/partner-navigation";

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
      try {
        const token = await partnerToken("/partenaire");
        if (!token) return;
        const session = await loadPartnerSession(token);
        if (session.passwordChangeRequired) { window.location.replace(partnerPasswordPath("/partenaire")); return; }
        setPartner(session.partner as Partner);
      } catch (cause) { setError(partnerAuthError(cause)); }
      finally { setLoading(false); }
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
            <ButtonLink href="/partenaire/leads">Voir les demandes</ButtonLink>
            <ButtonLink href="/partenaire/mot-de-passe">Modifier mon mot de passe</ButtonLink>
          </div>
        </PartnerCard>
      ) : null}
    </AppShell>
  );
}

function PartnerCard({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">{children}</section>;
}
