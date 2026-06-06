"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { Field, SelectField } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { problemTypes } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft, writeDraft } from "@/lib/storage";

export default function DiagnosticPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  const requiredFilled = useMemo(() => {
    return Boolean(
      draft.name &&
        draft.phone &&
        draft.email &&
        draft.postalCode &&
        draft.city &&
        draft.spaYear &&
        draft.installationType &&
        draft.problemType
    );
  }, [draft]);

  function update<K extends keyof DiagnosticDraft>(key: K, value: DiagnosticDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requiredFilled) {
      setError("Veuillez renseigner tous les champs obligatoires avant de continuer.");
      return;
    }
    writeDraft({
      ...draft,
      spaBrand: draft.spaBrand || "Non renseignée",
      answers: draft.answers ?? {},
      photos: draft.photos ?? {}
    });
    router.push("/questionnaire");
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Étape 1"
        title="Informations client et spa"
        description="Ces éléments permettent à SANISPA d'identifier le contexte technique avant d'analyser la panne."
      />
      <BackLink href="/" />

      <form onSubmit={submit} className="space-y-5 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" name="name" value={draft.name} onChange={(value) => update("name", value)} required />
          <Field label="Téléphone" name="phone" value={draft.phone} onChange={(value) => update("phone", value)} required type="tel" />
          <Field label="Email" name="email" value={draft.email} onChange={(value) => update("email", value)} required type="email" />
          <Field label="Adresse" name="address" value={draft.address} onChange={(value) => update("address", value)} />
          <Field label="Code postal" name="postalCode" value={draft.postalCode} onChange={(value) => update("postalCode", value)} required />
          <Field label="Ville" name="city" value={draft.city} onChange={(value) => update("city", value)} required />
          <Field label="Marque du spa si connue" name="spaBrand" value={draft.spaBrand} onChange={(value) => update("spaBrand", value)} />
          <Field label="Modèle si connu" name="spaModel" value={draft.spaModel} onChange={(value) => update("spaModel", value)} />
          <Field label="Année approximative" name="spaYear" value={draft.spaYear} onChange={(value) => update("spaYear", value)} required />
          <SelectField
            label="Type d'installation"
            name="installationType"
            value={draft.installationType}
            onChange={(value) => update("installationType", value as DiagnosticDraft["installationType"])}
            required
            options={[
              { value: "interieur", label: "Intérieur" },
              { value: "exterieur", label: "Extérieur" }
            ]}
          />
          <SelectField
            label="Type de problème"
            name="problemType"
            value={draft.problemType}
            onChange={(value) => update("problemType", value as DiagnosticDraft["problemType"])}
            required
            options={problemTypes}
          />
        </div>

        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full sm:w-auto">Continuer vers le questionnaire</Button>
      </form>
    </AppShell>
  );
}
