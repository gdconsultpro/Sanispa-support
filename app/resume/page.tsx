"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BackLink } from "@/components/BackLink";
import { Button } from "@/components/Button";
import { DiagnosticQuestion } from "@/components/DiagnosticQuestion";
import { DraftSave } from "@/components/DraftSave";
import { MovingMedia } from "@/components/MovingMedia";
import { StepHeader } from "@/components/StepHeader";
import { DiagnosticSummary } from "@/components/Summary";
import { paymentsPaused } from "@/lib/commercial-mode";
import { normalizeDiagnostic, updateDiagnosticAnswer } from "@/lib/diagnostic-answers";
import { missingContactFields, type ContactField } from "@/lib/diagnostic-contact";
import { remotePlans, spaAccessQuestion } from "@/lib/questions";
import { emptyDraft, readDraft, writeDraft, saveDraft, authHeaders } from "@/lib/storage";
import type { DiagnosticDraft } from "@/lib/types";

const options = [
  { value: "intervention", label: "Trouver un technicien", description: "SANISPA vous aide à trouver un professionnel près de chez vous." },
  { value: "devis", label: "Demander un devis", description: "SANISPA étudie votre demande pour préparer une estimation." },
] as const;
const section = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";

export default function ResumePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [missingContact, setMissingContact] = useState<readonly ContactField[]>([]);
  const submitting = useRef(false);

  useEffect(() => {
    const stored = readDraft();
    if (stored.diagnosticId) {
      router.replace(`/confirmation?id=${encodeURIComponent(stored.diagnosticId)}`);
      return;
    }
    if (!stored.problemType) {
      router.replace("/diagnostic");
      return;
    }
    setMissingContact(missingContactFields(stored));
    setDraft(stored.problemType === "demenagement" ? { ...stored, choice: "devis", paymentPlan: "" } : stored);
  }, [router]);

  const moving = draft.problemType === "demenagement";
  const waterPlan = draft.problemType === "traitement-eau" ? remotePlans.find(plan => plan.id === "water" && plan.enabled) : undefined;

  function selectOrientation(choice: DiagnosticDraft["choice"]) {
    setError("");
    const next: DiagnosticDraft = { ...draft, choice, paymentPlan: choice === "remote" ? "water" : "" };
    setDraft(normalizeDiagnostic(next));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const missing = missingContactFields(draft);
    if (missing.length) {
      setError("Complétez vos coordonnées avant d’envoyer votre demande.");
      if (!moving && missing.some(field => !missingContact.includes(field))) setEditingContact(true);
      document.getElementById("coordonnees-declaration")?.scrollIntoView({ block: "start" });
      return;
    }
    if (!draft.choice || (draft.choice === "remote" && !waterPlan)) {
      setError("Choisissez ce que vous souhaitez demander à SANISPA.");
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveDraft(draft, "/resume");
      const response = await fetch("/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify({ draftId: saved.draftId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.");
      writeDraft({ ...saved, diagnosticId: payload.diagnosticId });
      router.replace(`/confirmation?id=${encodeURIComponent(payload.diagnosticId)}`);
    } catch (cause) {
      submitting.current = false;
      setSaving(false);
      setError(cause instanceof Error ? cause.message : "Votre connexion a été interrompue. Réessayez.");
    }
  }

  if (!draft.problemType) return <AppShell compact><p role="status">Chargement de votre demande…</p></AppShell>;

  return <AppShell compact>
    <div className="mx-auto max-w-3xl">
      <StepHeader eyebrow={moving ? "Étape 3" : "Étape 4"}
        labels={moving ? ["Le transport", "Photos et vidéos", "La validation"] : undefined}
        title={moving ? "Vérifier mon projet de déménagement" : "Vérifier et envoyer ma demande"}
        description={moving ? "Vérifiez les adresses et les accès. SANISPA étudiera la faisabilité et préparera votre devis."
          : "Vérifiez vos informations et choisissez ce que vous attendez de SANISPA."} />
      <DraftSave draft={draft} step="/resume" sync={!saving} />
      <BackLink href="/upload" label={moving ? "Retour aux photos et vidéos" : "Retour aux photos"} />

      <form onSubmit={submit} className="space-y-4">
        <DiagnosticSummary draft={draft} contactEdit={!moving ? {
          fields: missingContact,
          expanded: editingContact,
          toggle: () => setEditingContact(value => !value),
          onChange: (field, value) => {
            setError("");
            setDraft(current => ({ ...current, [field]: value }));
          },
        } : undefined} />
        {moving && draft.draftId ? <MovingMedia draftId={draft.draftId} readOnly /> : null}

        {!moving ? <div className={section}>
          <fieldset>
            <legend className="mb-3 text-lg font-bold">De quoi avez-vous besoin ?</legend>
            <div className="grid gap-2">
              {options.map(option => <Orientation key={option.value} option={option} selected={draft.choice} choose={selectOrientation} />)}
              {waterPlan ? <Orientation
                option={{
                  value: "remote",
                  label: "Utiliser l’assistant de traitement d’eau",
                  description: paymentsPaused() ? "Un accompagnement gratuit pour interpréter vos relevés." : "Inclus dans SANISPA Premium.",
                }}
                selected={draft.choice} choose={selectOrientation} /> : null}
            </div>
          </fieldset>
          {draft.choice === "intervention" ? <details className="mt-3">
            <summary className="focus-ring w-fit cursor-pointer rounded py-2 text-sm font-bold text-sanispa-blue">Préciser l’accès au spa (facultatif)</summary>
            <div className="mt-2">
              <DiagnosticQuestion question={spaAccessQuestion} value={draft.answers.spa_access}
                onChange={value => {
                  setError("");
                  setDraft(current => updateDiagnosticAnswer(current, "spa_access", value));
                }} />
            </div>
          </details> : null}
        </div> : null}

        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}
        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? "Envoi de la demande…" : "Envoyer ma demande"}
        </Button>
      </form>
    </div>
  </AppShell>;
}

function Orientation({ option, selected, choose }: {
  option: { value: DiagnosticDraft["choice"]; label: string; description: string };
  selected: DiagnosticDraft["choice"];
  choose: (choice: DiagnosticDraft["choice"]) => void;
}) {
  return <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected === option.value ? "border-sanispa-blue bg-sanispa-ice" : "border-sanispa-line"}`}>
    <input type="radio" name="orientation" value={option.value} required checked={selected === option.value}
      onChange={() => choose(option.value)} className="focus-ring mt-1 h-4 w-4 shrink-0" />
    <span className="min-w-0">
      <span className="block font-bold">{option.label}</span>
      <span className="mt-1 block text-sm text-sanispa-steel">{option.description}</span>
    </span>
  </label>;
}
