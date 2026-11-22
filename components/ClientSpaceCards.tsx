import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, ButtonLink } from "./Button";
import { draftStepLabel, type DraftListItem } from "@/lib/client-drafts";
import { clientCaseProgress, type ClientCase } from "@/lib/client-case-progress";
import { problemLabel } from "@/lib/display-labels";

type SpaLabel = { id: string; brand: string; model: string | null };
export type CarePreview = {
  nextReminder: { spa_id: string; title: string; due_at: string } | null;
  lastReading: { spa_id: string; measured_at: string; ph: number | null; tac: number | null; temperature: number | null } | null;
};

const card = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";

function formatDate(date: string) {
  return new Date(date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
}

function spaLabel(id: string | null | undefined, spas: SpaLabel[]) {
  const spa = spas.find(item => item.id === id);
  return spa ? [spa.brand, spa.model].filter(Boolean).join(" ") : "";
}

export function DraftCard({ draft, spas, onCancel }: { draft: DraftListItem; spas: SpaLabel[]; onCancel: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const cancelButton = useRef<HTMLButtonElement>(null);
  const problem = draft.problemType ? problemLabel(draft.problemType) : "";
  const spa = spaLabel(draft.spaId, spas) || [draft.spaBrand, draft.spaModel].filter(Boolean).join(" ");
  async function confirmCancellation() {
    setCancelling(true);
    setError("");
    try {
      await onCancel();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’annuler ce brouillon. Réessayez.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <article className={card}>
      <h3 className="break-words text-lg font-bold">{problem || "Déclaration en cours"}</h3>
      {spa ? <p className="break-words text-sm text-sanispa-steel">{spa}</p> : null}
      <p className="mt-2 text-sm"><strong>Étape</strong> · {draftStepLabel(draft.step, draft.problemType)}</p>
      <p className="mt-1 text-sm text-sanispa-steel">
        {draft.local ? "Enregistré sur cet appareil" : "Enregistré dans votre compte"}
        {draft.updated_at ? ` · ${formatDate(draft.updated_at)}` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ButtonLink href={draft.local ? "/reprendre?local=1" : `/reprendre?id=${encodeURIComponent(draft.id)}`}>
          Reprendre ma déclaration
        </ButtonLink>
        <button type="button" ref={cancelButton} aria-expanded={confirming} disabled={cancelling}
          onClick={() => { setConfirming(!confirming); setError(""); }}
          className="focus-ring min-h-11 rounded-md px-2 text-sm font-bold text-sanispa-steel underline">
          Annuler ce brouillon
        </button>
      </div>
      {confirming ? (
        <div className="mt-3 rounded-xl border border-sanispa-line bg-sanispa-ice p-3">
          <p className="text-sm font-semibold">Annuler ce brouillon et effacer votre saisie ?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={cancelling} onClick={() => { setConfirming(false); setError(""); cancelButton.current?.focus(); }}>Garder le brouillon</Button>
            <Button type="button" disabled={cancelling} onClick={() => void confirmCancellation()}>{cancelling ? "Annulation en cours…" : "Confirmer l’annulation"}</Button>
          </div>
          {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

export function ClientCaseCard({ dossier, compact = false }: { dossier: ClientCase; compact?: boolean }) {
  const progress = clientCaseProgress(dossier);
  const company = dossier.intervened_company_name || dossier.assigned_partner?.company_name;
  if (compact) {
    const appointment = progress.label === "Rendez-vous confirmé" ? dossier.appointment : null;
    const start = appointment ? new Date(appointment.starts_at) : null;
    return (
      <Link href={progress.href} className="cobalt-hero__case focus-ring block rounded-xl border p-4 sm:p-5">
        <h2 className="text-sm font-bold text-white/90">{progress.label}</h2>
        {start && appointment ? (
          <time className="mt-2 block" dateTime={appointment.starts_at}>
            <span className="block text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
              {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
            </span>
            <span className="mt-1 block text-sm capitalize">
              {start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" })}
            </span>
          </time>
        ) : <p className="mt-2 text-sm">{progress.description}</p>}
        <p className="mt-3 text-sm font-semibold">{problemLabel(dossier.problem_type)}</p>
        {company ? <p className="mt-1 break-words text-sm text-white/90">Intervenant · {company}</p> : null}
        <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--sanispa-cyan)] underline underline-offset-4">{progress.action}<ArrowRight aria-hidden="true" size={16} /></span>
      </Link>
    );
  }
  return (
    <article className={card}>
      <p className="text-sm font-semibold text-sanispa-steel">Dossier n°{dossier.public_reference || "Référence en cours"}</p>
      <h3 className="mt-1 break-words text-lg font-bold">{problemLabel(dossier.problem_type)}</h3>
      <p className={`mt-3 inline-block rounded-lg px-3 py-2 text-sm font-bold ${progress.needsAttention ? "bg-amber-50 text-amber-900" : "bg-sanispa-ice text-sanispa-navy"}`}>
        {progress.label}
      </p>
      <p className="mt-2 text-sm leading-6">{progress.description}</p>
      {company ? <p className="mt-2 break-words text-sm">Intervenant · {company}</p> : null}
      <p className="mt-2 text-sm text-sanispa-steel">Mis à jour le {formatDate(progress.updatedAt)}</p>
      <div className="mt-4">
        <ButtonLink href={progress.href} variant={progress.needsAttention ? "primary" : "secondary"}>{progress.action}</ButtonLink>
      </div>
    </article>
  );
}

export function CarePreviewCards({ care, spas, compact = false }: { care: CarePreview | null; spas: SpaLabel[]; compact?: boolean }) {
  const reminder = care?.nextReminder;
  const reading = care?.lastReading;
  const values = reading ? [
    reading.ph == null ? null : `pH ${reading.ph.toLocaleString("fr-FR")}`,
    reading.tac == null ? null : `TAC ${reading.tac.toLocaleString("fr-FR")} mg/L`,
    reading.temperature == null ? null : `${reading.temperature.toLocaleString("fr-FR")} °C`,
  ].filter(Boolean) : [];
  const reminderSpa = spaLabel(reminder?.spa_id, spas);
  const reminderDate = reminder ? new Date(reminder.due_at).toLocaleDateString("fr-FR", { dateStyle: "medium" }) : "";
  const readingSpa = spaLabel(reading?.spa_id, spas);
  const carnet = `/premium/carnet${reminder ? `?spa=${encodeURIComponent(reminder.spa_id)}` : ""}`;
  const releves = `/premium/releves${reading ? `?spa=${encodeURIComponent(reading.spa_id)}` : ""}`;
  if (compact) return (
    <div className="grid min-w-0 gap-2 min-[375px]:grid-cols-2 sm:gap-3">
      {[
        { label: "Carnet et rappels", description: reminder ? `${reminder.title} · ${reminderDate}` : "", href: carnet },
        { label: "Relevés d’eau", description: values.join(" · "), href: releves },
      ].map(({ label, description, href }) => (
        <Link key={href} href={href} className="focus-ring flex min-h-12 min-w-0 items-start justify-between gap-2 rounded-lg border border-sanispa-line bg-white p-3 hover:border-sanispa-blue">
          <span className="min-w-0 break-words text-sm leading-5">
            <strong className="block">{label}</strong>
            {description ? <span className="block text-xs text-sanispa-steel">{description}</span> : null}
          </span>
          <ArrowRight size={16} className="mt-0.5" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <article className={card}>
        <h3 className="font-bold">Prochain rappel</h3>
        {reminder ? (
          <>
            <p className="mt-2 break-words font-semibold">{reminder.title}</p>
            <p className="mt-1 break-words text-sm">{reminderDate}{reminderSpa ? ` · ${reminderSpa}` : ""}</p>
            {Date.parse(reminder.due_at) < Date.now() ? <p className="mt-1 text-sm font-bold text-amber-800">À faire</p> : null}
          </>
        ) : <p className="mt-2 text-sm">{care ? "Aucun rappel prévu." : "Consultez les rappels de votre spa dans le carnet."}</p>}
        <Link href={carnet} className="focus-ring mt-3 inline-flex min-h-11 items-center font-bold underline">
          {reminder || !care ? "Ouvrir le carnet" : "Programmer un rappel"}
        </Link>
      </article>
      <article className={card}>
        <h3 className="font-bold">Dernier relevé d’eau</h3>
        {reading ? (
          <>
            <p className="mt-2 break-words font-semibold">{values.join(" · ") || "Relevé enregistré"}</p>
            <p className="mt-1 break-words text-sm">{formatDate(reading.measured_at)}{readingSpa ? ` · ${readingSpa}` : ""}</p>
          </>
        ) : <p className="mt-2 text-sm">{care ? "Aucune mesure enregistrée." : "Consultez les dernières mesures de votre spa."}</p>}
        <Link href={releves} className="focus-ring mt-3 inline-flex min-h-11 items-center font-bold underline">
          {reading || !care ? "Voir mes relevés" : "Ajouter un relevé"}
        </Link>
      </article>
    </div>
  );
}
