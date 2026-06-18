"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type PartnerLeadPreview = {
  id: string;
  access: "preview";
  createdAt: string;
  problemType: string;
  problemTypeKey: string;
  department: string | null;
  postalCode: string;
  city: string;
  spaBrand: string | null;
  spaModel: string | null;
  description: string | null;
  canUnlock: boolean;
  lockedUntil: string | null;
};

type PartnerLeadFull = Omit<PartnerLeadPreview, "access" | "canUnlock"> & {
  access: "full";
  canUnlock: false;
  status: string;
  customer: {
    name: string;
    phone: string;
    email: string;
    address: string;
    postalCode: string;
    city: string;
  };
  spa: {
    brand: string | null;
    model: string | null;
    year: string | null;
  };
  answers: Array<{ question: string; answer: string }>;
  photos: Array<{ type: string; url: string | null }>;
  documents: Array<{ id: string; name: string; type: string; url: string | null }>;
};

type PartnerLead = PartnerLeadPreview | PartnerLeadFull;

export default function PartnerLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [lead, setLead] = useState<PartnerLead | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

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

  async function unlockLead() {
    setUnlockError("");
    setUnlocking(true);

    const supabase = getSupabaseBrowser();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setUnlockError("Connectez-vous avec un compte partenaire pour débloquer ce dossier.");
      setUnlocking(false);
      return;
    }

    const response = await fetch(`/api/partner/leads/${params.id}/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();

    if (!response.ok) {
      setUnlockError(payload.error ?? "Déblocage impossible pour le moment.");
      setUnlocking(false);
      return;
    }

    if (payload.url) {
      window.location.href = payload.url;
      return;
    }

    setUnlockError("Stripe n'a pas retourné de page de paiement.");
    setUnlocking(false);
  }

  const unlockStatus = searchParams.get("unlock");

  return (
    <AppShell compact>
      <div className="mb-5">
        <Link href="/partenaire/leads" className="text-sm font-bold text-sanispa-blue">
          ← Retour aux leads
        </Link>
      </div>

      <StepHeader
        eyebrow={lead?.access === "full" ? "Dossier débloqué" : "Aperçu limité"}
        title="Détail du lead technique"
        description={
          lead?.access === "full"
            ? "Vous avez accès aux coordonnées client et aux éléments complets de ce dossier."
            : "Les coordonnées et les éléments complets du dossier sont masqués tant que le lead n'est pas débloqué."
        }
      />

      {unlockStatus === "success" ? (
        <div className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Dossier débloqué avec succès.
        </div>
      ) : null}
      {unlockStatus === "cancel" ? (
        <div className="mb-5 rounded-md border border-sanispa-line bg-white p-4 text-sm font-bold text-sanispa-steel">
          Déblocage annulé. Le dossier reste disponible tant qu'il n'a pas été acheté par un autre partenaire.
        </div>
      ) : null}

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

          {lead.access === "preview" ? (
            <div className="mt-6">
              {unlockError ? <div className="mb-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{unlockError}</div> : null}
              <button
                type="button"
                disabled={!lead.canUnlock || unlocking}
                onClick={unlockLead}
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-sanispa-navy px-5 py-3 text-sm font-bold text-white focus-ring disabled:cursor-not-allowed disabled:bg-sanispa-steel/30 disabled:text-sanispa-navy"
              >
                {unlocking ? "Ouverture Stripe..." : "Débloquer ce dossier - 10 € TTC"}
              </button>
              {!lead.canUnlock ? (
                <p className="mt-3 text-sm font-semibold text-sanispa-steel">
                  Ce dossier est temporairement verrouillé ou déjà en cours de déblocage.
                </p>
              ) : null}
            </div>
          ) : null}

          {lead.access === "full" ? <FullLead lead={lead} /> : null}
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

function FullLead({ lead }: { lead: PartnerLeadFull }) {
  return (
    <div className="mt-8 grid gap-6">
      <section className="rounded-md bg-sanispa-ice p-4">
        <h3 className="text-lg font-black text-sanispa-navy">Coordonnées client</h3>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <PreviewItem label="Nom" value={lead.customer.name || "Non renseigné"} />
          <PreviewItem label="Téléphone" value={lead.customer.phone || "Non renseigné"} />
          <PreviewItem label="Email" value={lead.customer.email || "Non renseigné"} />
          <PreviewItem label="Adresse" value={lead.customer.address || "Non renseignée"} />
        </dl>
      </section>

      <section>
        <h3 className="text-lg font-black text-sanispa-navy">Réponses détaillées</h3>
        <div className="mt-3 grid gap-2">
          {lead.answers.length ? (
            lead.answers.map((answer, index) => (
              <div key={`${answer.question}-${index}`} className="rounded-md border border-sanispa-line bg-white p-3">
                <p className="font-bold text-sanispa-navy">{answer.question}</p>
                <p className="mt-1 text-sanispa-steel">{answer.answer || "Non renseigné"}</p>
              </div>
            ))
          ) : (
            <p className="text-sanispa-steel">Aucune réponse détaillée.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-black text-sanispa-navy">Photos</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lead.photos.length ? (
            lead.photos.map((photo, index) =>
              photo.url ? (
                <Link key={`${photo.type}-${index}`} href={photo.url} target="_blank" className="group">
                  <img src={photo.url} alt={photo.type} className="h-36 w-full rounded-md object-cover" />
                  <span className="mt-1 block text-sm font-bold text-sanispa-steel group-hover:text-sanispa-blue">{photo.type}</span>
                </Link>
              ) : null
            )
          ) : (
            <p className="text-sanispa-steel">Aucune photo disponible.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-black text-sanispa-navy">Documents liés</h3>
        <div className="mt-3 grid gap-2">
          {lead.documents.length ? (
            lead.documents.map((document) => (
              <div key={document.id} className="flex flex-col gap-2 rounded-md border border-sanispa-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-sanispa-navy">{document.name}</p>
                  <p className="text-sm text-sanispa-steel">{document.type}</p>
                </div>
                {document.url ? (
                  <Link href={document.url} target="_blank" className="rounded-md border border-sanispa-line px-3 py-2 text-sm font-bold text-sanispa-navy focus-ring">
                    Télécharger
                  </Link>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sanispa-steel">Aucun document lié.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
