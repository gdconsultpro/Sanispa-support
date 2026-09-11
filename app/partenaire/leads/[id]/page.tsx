"use client";
import { PrivateFile } from "@/components/PrivateFile";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { partnerToken, redirectPartnerAccess } from "@/lib/partner-browser";
import { partnerLoginPath, withPartnerTimeout } from "@/lib/partner-navigation";
import type { PartnerLeadPreview, PartnerLeadFull } from "@/lib/partner-leads";

type PartnerLead = PartnerLeadPreview | PartnerLeadFull;

export default function PartnerLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [lead, setLead] = useState<PartnerLead | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [acquisitionConfirmed, setAcquisitionConfirmed] = useState(false);
  const unlockPending = useRef(false);
  const currentRequest = useRef<AbortController | null>(null);

  const loadLead = useCallback(async (): Promise<PartnerLead | null> => {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true);
    setError("");
    setLead(null);
    try {
      const token = await partnerToken(`/partenaire/leads/${params.id}`);
      if (!token) return null;

      const response = await withPartnerTimeout(fetch(`/api/partner/leads/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: "no-store"
      }));
      if (redirectPartnerAccess(response, `/partenaire/leads/${params.id}`)) return null;
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Ce dossier n’a pas pu être chargé. Réessayez.");
      if (!isPartnerLead(payload?.lead)) throw new Error("La réponse ne permet pas de confirmer l’accès au dossier. Actualisez la page pour réessayer.");
      if (controller.signal.aborted) return null;
      setLead(payload.lead);
      return payload.lead;
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "La connexion a été interrompue. Actualisez le dossier pour réessayer.");
      return null;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    setUnlockError("");
    setAwaitingConfirmation(false);
    setAcquisitionConfirmed(false);
    if (params.id) void loadLead();
    return () => currentRequest.current?.abort();
  }, [params.id, loadLead]);

  async function unlockLead() {
    if (unlockPending.current || !lead || lead.access !== "preview" || !lead.canUnlock || !lead.billing.available) return;
    unlockPending.current = true;
    let redirecting = false;
    setUnlockError("");
    setUnlocking(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Connectez-vous avec un compte partenaire pour prendre en charge ce dossier.");
      const response = await fetch(`/api/partner/leads/${params.id}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "La prise en charge n’a pas pu être confirmée. Actualisez le dossier avant de réessayer.");
      if (payload?.acquired === true) {
        setAwaitingConfirmation(true);
        const refreshed = await loadLead();
        if (refreshed?.access === "full") {
          setAwaitingConfirmation(false);
          setAcquisitionConfirmed(true);
        }
        return;
      }
      if (typeof payload?.url === "string" && payload.url) {
        window.location.assign(payload.url);
        redirecting = true;
        return;
      }
      throw new Error("La réponse ne permet pas de confirmer la prise en charge. Actualisez le dossier avant de réessayer.");
    } catch (cause) {
      setUnlockError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "La connexion a été interrompue. Actualisez le dossier pour vérifier son attribution avant de réessayer.");
    } finally {
      if (!redirecting) {
        unlockPending.current = false;
        setUnlocking(false);
      }
    }
  }

  const unlockStatus = searchParams.get("unlock");
  const amountLabel = lead ? formatAmount(lead.billing.amount, lead.billing.currency) : null;
  const confirmationRequested = unlockStatus === "success" || awaitingConfirmation || acquisitionConfirmed;

  return (
    <AppShell compact>
      <p className="mb-4 text-sm"><Link href="/partenaire" className="font-bold text-sanispa-blue underline">Mon espace partenaire et mon mot de passe</Link></p>
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

      {confirmationRequested && !loading && lead?.access === "full" ? (
        <div className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800" role="status">
          Ce dossier vous est attribué. Vous pouvez consulter les coordonnées et les éléments disponibles.
        </div>
      ) : null}
      {confirmationRequested && lead?.access !== "full" ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <p>{loading ? "Vérification de l’attribution du dossier…" : "La confirmation de l’attribution est encore attendue. Les coordonnées restent masquées tant que votre accès n’est pas confirmé."}</p>
          {!loading ? <button type="button" disabled={unlocking} onClick={() => void loadLead()} className="focus-ring mt-3 rounded font-bold underline disabled:opacity-50">Actualiser le dossier</button> : null}
        </div>
      ) : null}
      {unlockStatus === "cancel" && !confirmationRequested && !loading && lead?.access === "preview" ? (
        <div className="mb-5 rounded-md border border-sanispa-line bg-white p-4 text-sm font-bold text-sanispa-steel">
          Paiement interrompu. Ce dossier ne vous est pas encore attribué.
        </div>
      ) : null}

      {loading ? <DetailCard>Chargement du lead...</DetailCard> : null}
      {!loading && error ? <DetailCard>
        <p role="alert">{error}</p>
        <button type="button" disabled={unlocking} onClick={() => void loadLead()} className="focus-ring mt-3 rounded text-sm font-bold text-sanispa-blue underline disabled:opacity-50">Réessayer</button>
      </DetailCard> : null}
      {unlockError ? <div className="mb-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">
        <p>{unlockError}</p>
        <button type="button" disabled={loading || unlocking} onClick={() => { setUnlockError(""); void loadLead(); }} className="focus-ring mt-3 rounded font-bold underline disabled:opacity-50">Actualiser le dossier</button>
      </div> : null}

      {!loading && lead ? (
        <DetailCard>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-sanispa-blue">{lead.problemType}</p>
          <h2 className="mt-2 text-3xl font-black text-sanispa-navy">
            {lead.postalCode} {lead.city}
          </h2>
          {lead.access === "preview" || lead.billing.amount !== null ? <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className={`rounded-full px-3 py-1 font-bold ${lead.billing.paymentRequired ? "bg-sanispa-ice text-sanispa-navy" : "bg-green-50 text-green-800"}`}>
              {lead.billing.paymentRequired ? "Payant" : "Gratuit"}
            </span>
            {lead.billing.paymentRequired ? <span className="font-bold text-sanispa-navy">{amountLabel ?? "Tarif indisponible"}</span> : null}
          </div> : null}

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
              {lead.billing.reserved ? <p className="mb-3 text-sm text-sanispa-steel">
                Conditions réservées{amountLabel ? ` : ${amountLabel}` : ""}. Reprenez le paiement engagé pour ce dossier.
              </p> : null}
              <button
                type="button"
                disabled={!lead.canUnlock || !lead.billing.available || (lead.billing.paymentRequired && !amountLabel) || unlocking}
                onClick={unlockLead}
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-sanispa-navy px-5 py-3 text-sm font-bold text-white focus-ring disabled:cursor-not-allowed disabled:bg-sanispa-steel/30 disabled:text-sanispa-navy"
              >
                {unlocking ? "Traitement en cours…" : !lead.billing.paymentRequired ? "Prendre en charge gratuitement"
                  : `${lead.billing.reserved ? "Reprendre le paiement" : "Payer pour prendre en charge"}${amountLabel ? ` — ${amountLabel}` : ""}`}
              </button>
              {!lead.billing.available || (lead.billing.paymentRequired && !amountLabel) ? (
                <p className="mt-3 text-sm font-semibold text-sanispa-steel">
                  La prise en charge est indisponible pour le moment. Actualisez le dossier pour consulter les conditions disponibles.
                </p>
              ) : !lead.canUnlock ? (
                <p className="mt-3 text-sm font-semibold text-sanispa-steel">Ce dossier n’est pas disponible pour une prise en charge. Actualisez le dossier pour vérifier son état.</p>
              ) : null}
              {!lead.canUnlock || !lead.billing.available ? <button type="button" disabled={unlocking} onClick={() => void loadLead()} className="focus-ring mt-3 rounded text-sm font-bold text-sanispa-blue underline disabled:opacity-50">Actualiser le dossier</button> : null}
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
                <PrivateFile key={`${photo.type}-${index}`} url={photo.url} name={photo.type} photo />
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
                  <PrivateFile url={document.url} name={document.name} />
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

function isPartnerLead(value: unknown): value is PartnerLead {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PartnerLead>;
  if (typeof candidate.id !== "string" || !candidate.billing || typeof candidate.billing.paymentRequired !== "boolean" ||
    typeof candidate.billing.available !== "boolean" || typeof candidate.billing.reserved !== "boolean" ||
    typeof candidate.billing.currency !== "string" ||
    !(candidate.billing.amount === null || (typeof candidate.billing.amount === "number" && Number.isFinite(candidate.billing.amount)))) return false;
  if (candidate.access === "preview") return typeof candidate.canUnlock === "boolean";
  return candidate.access === "full" && Boolean(candidate.customer) &&
    Array.isArray(candidate.answers) && Array.isArray(candidate.photos) && Array.isArray(candidate.documents);
}
