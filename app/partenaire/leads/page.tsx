"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { PartnerLeadPreview } from "@/lib/partner-leads";

export default function PartnerLeadsPage() {
  const [leads, setLeads] = useState<PartnerLeadPreview[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const currentRequest = useRef<AbortController | null>(null);

  const loadLeads = useCallback(async () => {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Connectez-vous avec un compte partenaire pour consulter les leads.");

      const response = await fetch("/api/partner/leads", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: "no-store"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Chargement impossible. Réessayez.");
      if (!Array.isArray(payload?.leads) || !payload.leads.every(isLeadPreview)) throw new Error("La liste des demandes n’a pas pu être chargée. Réessayez.");
      if (!controller.signal.aborted) setLeads(payload.leads);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setLeads([]);
        setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "La connexion a été interrompue. Réessayez de charger les demandes.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
    return () => currentRequest.current?.abort();
  }, [loadLeads]);

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
          <p className="font-bold text-sanispa-navy" role="alert">{error}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => void loadLeads()} className="focus-ring rounded text-sm font-bold text-sanispa-blue underline">Réessayer</button>
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
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-3 py-1 font-bold ${lead.billing.paymentRequired ? "bg-sanispa-ice text-sanispa-navy" : "bg-green-50 text-green-800"}`}>
                  {lead.billing.paymentRequired ? "Payant" : "Gratuit"}
                </span>
                {lead.billing.paymentRequired ? <span className="font-bold text-sanispa-navy">{formatAmount(lead.billing.amount, lead.billing.currency) ?? "Tarif indisponible"}</span> : null}
                {lead.billing.reserved ? <span className="text-sanispa-steel">Paiement en cours · conditions réservées</span> : null}
              </div>
              {!lead.billing.available ? <p className="mt-2 text-sm text-sanispa-steel">Prise en charge indisponible pour le moment.</p> : null}
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
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Date non renseignée";
}

function formatAmount(amount: number | null, currency: string) {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null;
  try {
    const formatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** digits);
  } catch {
    return null;
  }
}

function isLeadPreview(value: unknown): value is PartnerLeadPreview {
  if (!value || typeof value !== "object") return false;
  const lead = value as Partial<PartnerLeadPreview>;
  return typeof lead.id === "string" && Boolean(lead.billing) &&
    typeof lead.billing?.paymentRequired === "boolean" && typeof lead.billing?.available === "boolean" &&
    typeof lead.billing?.reserved === "boolean" && typeof lead.billing?.currency === "string" &&
    (lead.billing?.amount === null || (typeof lead.billing?.amount === "number" && Number.isFinite(lead.billing.amount)));
}
